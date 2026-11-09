//! Windows Explorer desktop host adapter. Shell host discovery is intentionally
//! isolated: it is not a public Windows contract and may fail on newer shells.
use std::ptr::null_mut;
use windows_sys::Win32::Graphics::Gdi::{ScreenToClient, MonitorFromPoint, GetMonitorInfoW, MONITORINFO, MONITOR_DEFAULTTOPRIMARY};
use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, DWMWA_COLOR_DEFAULT};
use windows_sys::Win32::{Foundation::{HWND, LPARAM, RECT, SetLastError, GetLastError}, UI::WindowsAndMessaging::*};

#[derive(Clone, Copy)]
pub struct Attachment { parent: isize, style: isize, ex_style: isize, rect: RECT }

fn wide(s: &str) -> Vec<u16> { s.encode_utf16().chain(Some(0)).collect() }

unsafe extern "system" fn find_host(top: HWND, param: LPARAM) -> i32 {
    let view = FindWindowExW(top, null_mut(), wide("SHELLDLL_DefView").as_ptr(), std::ptr::null());
    if !view.is_null() {
        let worker = FindWindowExW(null_mut(), top, wide("WorkerW").as_ptr(), std::ptr::null());
        if !worker.is_null() && FindWindowExW(worker, null_mut(), wide("SHELLDLL_DefView").as_ptr(), std::ptr::null()).is_null() {
            *(param as *mut HWND) = worker; return 0;
        }
    }
    1
}

unsafe fn parent(hwnd: HWND, next: HWND) -> Result<(), String> {
    SetLastError(0);
    let old = SetParent(hwnd, next);
    let error = GetLastError();
    if old.is_null() && error != 0 { Err(format!("桌面嵌入失败，Windows 错误 {error}")) } else { Ok(()) }
}

unsafe fn style(hwnd: HWND, index: i32, value: isize) -> Result<(), String> {
    SetLastError(0);
    let old = SetWindowLongPtrW(hwnd, index, value);
    let error = GetLastError();
    if old == 0 && error != 0 { Err(format!("窗口样式设置失败，Windows 错误 {error}")) } else { Ok(()) }
}

pub fn attach(hwnd: HWND) -> Result<Attachment, String> { unsafe {
    let progman = FindWindowW(wide("Progman").as_ptr(), std::ptr::null());
    if progman.is_null() { return Err("未找到 Windows 桌面，请确认 Explorer 正在运行".into()); }
    // Explorer's raised desktop uses Progman children on recent Windows.
    // Preserve classic discovery and probe known message variants before failing.
    let mut chosen=None;
    let mut last_icons: HWND=null_mut();
    let mut modern=false;
    for (wp,lp) in [(0usize,0isize),(0x0d,0),(0x0d,1)] {
        SendMessageTimeoutW(progman,0x052c,wp,lp,SMTO_ABORTIFHUNG,1000,null_mut());
        let icons=FindWindowExW(progman,null_mut(),wide("SHELLDLL_DefView").as_ptr(),std::ptr::null());
        last_icons=icons;
        modern=GetWindowLongPtrW(progman,GWL_EXSTYLE) as u32 & WS_EX_NOREDIRECTIONBITMAP != 0;
        let mut sibling: HWND=null_mut();
        EnumWindows(Some(find_host),&mut sibling as *mut HWND as LPARAM);
        let candidate=FindWindowExW(progman,null_mut(),wide("WorkerW").as_ptr(),std::ptr::null());
        let child=if !candidate.is_null() && FindWindowExW(candidate,null_mut(),wide("SHELLDLL_DefView").as_ptr(),std::ptr::null()).is_null() {candidate} else {null_mut()};
        chosen=crate::host_discovery::select(modern,progman as isize,icons as isize,sibling as isize,child as isize);
        if chosen.is_some(){break;}
    }
    let chosen=chosen.ok_or_else(||format!("未找到兼容的桌面背景层（图标层={}，新版合成={}）。请确认显示桌面图标、退出其他动态壁纸后重试；设置窗口已保留。",!last_icons.is_null(),modern))?;
    let host=chosen.parent as HWND;
    if IsWindow(host)==0 {return Err("桌面背景层已变化，请重试".into());}
    let mut rect: RECT = std::mem::zeroed();
    if GetWindowRect(hwnd, &mut rect) == 0 { return Err("无法读取预览窗口位置".into()); }
    let saved = Attachment { parent: GetParent(hwnd) as isize,
        style: GetWindowLongPtrW(hwnd, GWL_STYLE), ex_style: GetWindowLongPtrW(hwnd, GWL_EXSTYLE), rect };
    let mut bounds: RECT = std::mem::zeroed();
    if GetClientRect(host, &mut bounds) == 0 { return Err("无法读取桌面尺寸".into()); }
    // Full primary-monitor bounds, including the area behind the taskbar.
    // Do not mix CSS/logical dimensions with native screen coordinates.
    let monitor = MonitorFromPoint(windows_sys::Win32::Foundation::POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY);
    let mut info: MONITORINFO = std::mem::zeroed();
    info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
    if GetMonitorInfoW(monitor, &mut info) == 0 { return Err("无法读取显示器边界".into()); }
    let width = info.rcMonitor.right - info.rcMonitor.left;
    let height = info.rcMonitor.bottom - info.rcMonitor.top;
    let mut origin = windows_sys::Win32::Foundation::POINT { x: info.rcMonitor.left, y: info.rcMonitor.top };
    if ScreenToClient(host, &mut origin) == 0 { return Err("无法转换桌面坐标".into()); }
    let result = (|| {
        style(hwnd, GWL_STYLE, (saved.style & !((WS_POPUP | WS_OVERLAPPEDWINDOW | WS_MAXIMIZE) as isize)) | WS_CHILD as isize)?;
        parent(hwnd, host)?;
        style(hwnd, GWL_EXSTYLE, (saved.ex_style & !((WS_EX_APPWINDOW | WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE | WS_EX_DLGMODALFRAME | WS_EX_STATICEDGE) as isize)) | WS_EX_TOOLWINDOW as isize | WS_EX_NOACTIVATE as isize)?;
        if chosen.layered {
            // Raised desktop: layered child below icons, above the shell WorkerW.
            let ex=GetWindowLongPtrW(hwnd,GWL_EXSTYLE);
            style(hwnd,GWL_EXSTYLE,(ex & !(WS_EX_NOREDIRECTIONBITMAP as isize)) | WS_EX_LAYERED as isize)?;
            if SetLayeredWindowAttributes(hwnd,0,255,LWA_ALPHA)==0 {
                return Err(format!("新版桌面合成初始化失败：{}",GetLastError()));
            }
        }
        // Windows 11 can draw a DWM accent border independently of WS_BORDER.
        // Older Windows may reject this optional attribute; native styles still apply.
        let color = DWMWA_COLOR_NONE;
        let _ = DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR as u32, &color as *const u32 as *const _, 4);
        if SetWindowPos(hwnd, chosen.after as HWND, origin.x, origin.y, width, height,
            SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW) == 0 { return Err("无法调整桌面壁纸尺寸".into()); }
        Ok(())
    })();
    if let Err(error) = result { let _ = detach(hwnd, saved); return Err(error); }
    Ok(saved)
} }

pub fn detach(hwnd: HWND, saved: Attachment) -> Result<(), String> { unsafe {
    let color = DWMWA_COLOR_DEFAULT;
    let _ = DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR as u32, &color as *const u32 as *const _, 4);
    parent(hwnd, saved.parent as HWND)?;
    style(hwnd, GWL_STYLE, saved.style)?;
    style(hwnd, GWL_EXSTYLE, saved.ex_style)?;
    let r = saved.rect;
    if SetWindowPos(hwnd, HWND_NOTOPMOST, r.left, r.top, r.right-r.left, r.bottom-r.top,
        SWP_FRAMECHANGED | SWP_SHOWWINDOW) == 0 { return Err("无法还原设置窗口".into()); }
    Ok(())
} }

// Returns normalized client coordinates only over the desktop, not other apps.
pub fn pointer(hwnd: HWND) -> Option<(f64, f64)> { unsafe {
    let mut point = windows_sys::Win32::Foundation::POINT { x: 0, y: 0 };
    if GetCursorPos(&mut point) == 0 { return None; }
    let root = GetAncestor(WindowFromPoint(point), GA_ROOT);
    let mut class = [0u16; 128];
    let n = GetClassNameW(root, class.as_mut_ptr(), class.len() as i32);
    let name = String::from_utf16_lossy(&class[..n.max(0) as usize]);
    if name != "Progman" && name != "WorkerW" { return None; }
    if ScreenToClient(hwnd, &mut point) == 0 { return None; }
    let mut r: RECT = std::mem::zeroed();
    if GetClientRect(hwnd, &mut r) == 0 || r.right <= 0 || r.bottom <= 0 { return None; }
    let x = point.x as f64 / r.right as f64;
    let y = point.y as f64 / r.bottom as f64;
    if (0.0..=1.0).contains(&x) && (0.0..=1.0).contains(&y) { Some((x, y)) } else { None }
} }
