//! Shell topology selection, kept separate for regression testing.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Host { pub parent: isize, pub after: isize, pub layered: bool }
pub fn select(modern:bool, progman:isize, icons:isize, sibling:isize, child:isize)->Option<Host> {
    if modern && progman!=0 && icons!=0 { return Some(Host{parent:progman,after:icons,layered:true}); }
    if sibling!=0 { return Some(Host{parent:sibling,after:1,layered:false}); }
    if child!=0 && icons!=0 { return Some(Host{parent:child,after:1,layered:false}); }
    None
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn classic_host_unchanged(){assert_eq!(select(false,10,20,30,0),Some(Host{parent:30,after:1,layered:false}));}
    #[test] fn modern_is_between_icons_and_system_background(){assert_eq!(select(true,10,20,30,40),Some(Host{parent:10,after:20,layered:true}));}
    #[test] fn child_worker_needs_verified_icon_layer(){assert_eq!(select(false,10,20,0,40).unwrap().parent,40);assert_eq!(select(false,10,0,0,40),None);}
    #[test] fn unknown_shell_never_uses_arbitrary_top_level_parent(){assert_eq!(select(false,10,20,0,0),None);assert_eq!(select(true,10,0,0,0),None);}
}
