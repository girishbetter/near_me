{pkgs}: {
  deps = [
    pkgs.libgbm
    pkgs.systemd
    pkgs.glib
    pkgs.dbus
    pkgs.cups
    pkgs.at-spi2-core
    pkgs.alsa-lib
    pkgs.cairo
    pkgs.pango
    pkgs.libxkbcommon
    pkgs.xorg.libxcb
    pkgs.mesa
    pkgs.xorg.libXfixes
    pkgs.xorg.libXdamage
    pkgs.xorg.libXcomposite
    pkgs.expat
    pkgs.libdrm
    pkgs.nss
    pkgs.nspr
    pkgs.unzip
  ];
}
