use std::sync::atomic::{AtomicBool, Ordering};
use windows_sys::Win32::{Foundation::*, Graphics::{Gdi::*, Dwm::*}, UI::{WindowsAndMessaging::*, Shell::*}, System::{StationsAndDesktops::*, Power::*}};
use windows_sys::Win32::UI::HiDpi::{SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, DPI_AWARENESS_CONTEXT};
struct DpiGuard(DPI_AWARENESS_CONTEXT);
impl Drop for DpiGuard { fn drop(&mut self) { unsafe { SetThreadDpiAwarenessContext(self.0); } } }
static DISPLAY_OFF: AtomicBool = AtomicBool::new(false);
const DISPLAY_GUID: windows_sys::core::GUID = windows_sys::core::GUID::from_u128(0x6fe69556_704a_47a0_8f24_c28d936fda47);
unsafe extern "system" fn power_message(hwnd: HWND, msg:u32, wp:WPARAM, lp:LPARAM, id:usize, data:usize)->LRESULT {
    if msg==WM_POWERBROADCAST {
        if wp as u32==PBT_POWERSETTINGCHANGE && lp!=0 {
            let setting=&*(lp as *const POWERBROADCAST_SETTING);
            if setting.PowerSetting.data1==DISPLAY_GUID.data1 && setting.DataLength==4 {
                let value=std::ptr::read_unaligned(setting.Data.as_ptr() as *const u32);
                DISPLAY_OFF.store(value==0, Ordering::Relaxed);
            }
        } else if wp as u32==PBT_APMSUSPEND { DISPLAY_OFF.store(true,Ordering::Relaxed); }
        else if wp as u32==PBT_APMRESUMEAUTOMATIC || wp as u32==PBT_APMRESUMESUSPEND { DISPLAY_OFF.store(false,Ordering::Relaxed); }
    }
    if msg==WM_NCDESTROY {
        if data!=0 { UnregisterPowerSettingNotification(data as HPOWERNOTIFY); }
        RemoveWindowSubclass(hwnd,Some(power_message),id);
    }
    DefSubclassProc(hwnd,msg,wp,lp)
}
pub fn watch(hwnd:HWND) { unsafe {
    let notification=RegisterPowerSettingNotification(hwnd,&DISPLAY_GUID,DEVICE_NOTIFY_WINDOW_HANDLE);
    if SetWindowSubclass(hwnd,Some(power_message),0x454c504f,notification as usize)==0 && notification!=0 {
        UnregisterPowerSettingNotification(notification);
    }
} }

fn locked()->bool { unsafe {
    let desktop=OpenInputDesktop(0,0,DESKTOP_READOBJECTS);
    if desktop.is_null() { return GetLastError()==5; } // secure desktop denied
    let mut name=[0u16;128]; let mut needed=0;
    let ok=GetUserObjectInformationW(desktop,UOI_NAME,name.as_mut_ptr() as *mut _,256,&mut needed);
    CloseDesktop(desktop);
    if ok==0 { return false; }
    let n=name.iter().position(|v|*v==0).unwrap_or(name.len());
    !String::from_utf16_lossy(&name[..n]).eq_ignore_ascii_case("default")
} }

#[derive(Clone,Copy,Debug,PartialEq)]
struct Area { l:i32,t:i32,r:i32,b:i32 }
fn subtract(a:Area,c:Area)->Vec<Area> {
    let l=a.l.max(c.l);let r=a.r.min(c.r);let t=a.t.max(c.t);let b=a.b.min(c.b);
    if l>=r||t>=b { return vec![a]; }
    [Area{l:a.l,t:a.t,r:a.r,b:t},Area{l:a.l,t:b,r:a.r,b:a.b},Area{l:a.l,t,r:l,b},Area{l:r,t,r:a.r,b}]
        .into_iter().filter(|v|v.l<v.r&&v.t<v.b).collect()
}
struct Coverage { own:HWND, remaining:Vec<Area>, partial:bool, target:Area }
unsafe extern "system" fn cover(hwnd:HWND,param:LPARAM)->i32 {
    let c=&mut *(param as *mut Coverage);
    if hwnd==c.own || IsWindowVisible(hwnd)==0 || IsIconic(hwnd)!=0 { return 1; }
    let mut name=[0u16;128]; let n=GetClassNameW(hwnd,name.as_mut_ptr(),128);
    let name=String::from_utf16_lossy(&name[..n.max(0) as usize]);
    if ["Progman","WorkerW","Shell_TrayWnd","Shell_SecondaryTrayWnd"].contains(&name.as_str()) {return 1;}
    let mut cloaked:u32=0;
    if DwmGetWindowAttribute(hwnd,DWMWA_CLOAKED as u32,&mut cloaked as *mut u32 as *mut _,4)<0 || cloaked!=0 {return 1;}
    let mut rect:RECT=std::mem::zeroed();
    if DwmGetWindowAttribute(hwnd,DWMWA_EXTENDED_FRAME_BOUNDS as u32,&mut rect as *mut RECT as *mut _,std::mem::size_of::<RECT>() as u32)<0 {return 1;}
    let a=Area{l:rect.left,t:rect.top,r:rect.right,b:rect.bottom};
    if subtract(c.target,a)==vec![c.target] { return 1; }
    c.partial=true;
    let ex=GetWindowLongPtrW(hwnd,GWL_EXSTYLE) as u32;
    // Translucency and custom regions are uncertain: reduce FPS, never infer sleep.
    if ex&(WS_EX_LAYERED|WS_EX_TRANSPARENT)!=0 {return 1;}
    let region=CreateRectRgn(0,0,0,0); if region.is_null(){return 1;}
    let custom=GetWindowRgn(hwnd,region); DeleteObject(region);
    if custom!=0 {return 1;}
    // Ordinary rounded windows contribute only their conservative inner rectangle.
    let covers= a.l<=c.target.l && a.t<=c.target.t && a.r>=c.target.r && a.b>=c.target.b;
    let a=if IsZoomed(hwnd)!=0||covers {a} else {Area{l:a.l+12,t:a.t+12,r:a.r-12,b:a.b-12}};
    if a.l<a.r&&a.t<a.b {c.remaining=c.remaining.iter().flat_map(|v|subtract(*v,a)).collect();}
    if c.remaining.is_empty(){0}else{1}
}
/// 0 normal, 1 reduced, 2 sleeping. Only desktop-embedded windows use coverage.
pub fn status(hwnd:HWND,wallpaper:bool)->u8 { unsafe {
    if DISPLAY_OFF.load(Ordering::Relaxed)||locked(){return 2;}
    if IsIconic(hwnd)!=0 {return 2;}
    if !wallpaper {return 0;}
    // DWM bounds are physical pixels. Read monitor geometry in the same space,
    // even if Explorer reparenting changed the process DPI behavior.
    let old=SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    if old.is_null(){return 0;}
    let _dpi=DpiGuard(old);
    let monitor=MonitorFromWindow(hwnd,MONITOR_DEFAULTTOPRIMARY);
    let mut info:MONITORINFO=std::mem::zeroed();info.cbSize=std::mem::size_of::<MONITORINFO>() as u32;
    if GetMonitorInfoW(monitor,&mut info)==0{return 0;}
    let r=info.rcWork;let target=Area{l:r.left,t:r.top,r:r.right,b:r.bottom};
    let mut c=Coverage{own:hwnd,remaining:vec![target],partial:false,target};
    EnumWindows(Some(cover),&mut c as *mut Coverage as LPARAM);
    if c.remaining.is_empty(){2}else if c.partial{1}else{0}
} }
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn union_requires_full_coverage(){
        let screen=Area{l:0,t:0,r:100,b:100};
        let remaining=subtract(screen,Area{l:0,t:0,r:50,b:100});
        assert_eq!(remaining,vec![Area{l:50,t:0,r:100,b:100}]);
        assert!(subtract(remaining[0],Area{l:50,t:0,r:100,b:100}).is_empty());
        assert_eq!(subtract(screen,Area{l:100,t:0,r:200,b:100}),vec![screen]);
    }
    #[test] fn small_window_preserves_visible_area(){
        let parts=subtract(Area{l:0,t:0,r:100,b:100},Area{l:20,t:20,r:80,b:80});
        assert_eq!(parts.iter().map(|r|(r.r-r.l)*(r.b-r.t)).sum::<i32>(),6400);
    }
}
