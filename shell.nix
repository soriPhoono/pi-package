{
  pkgs,
  config,
  ...
}:
with pkgs;
  mkShell {
    packages = [
      gh

      nixd
      nil
      alejandra

      # age
    ];

    shellHook = ''
      source ${config.agenix-shell.installationScript}/bin/install-agenix-shell

      ${config.pre-commit.shellHook}
    '';
  }
