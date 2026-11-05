# Installed cloudflared

The npm postinstall step downloads only the host's unmodified Cloudflare 2026.10.7 executable into `<platform>-<architecture>/`. Windows x64, macOS x64/arm64, and Linux x64/arm64 are supported. Release asset SHA-256 digests are pinned in `scripts/cloudflared-release.mjs`; macOS archive and extracted executable checksums are both verified. A valid existing executable is reused. Downloads are installed atomically, and failed downloads do not replace an existing executable.

Generated executables are excluded from Git and the npm tarball. Only this README and LICENSE ship in the tarball. No executable is downloaded during Node startup. Docker separately downloads its architecture's executable when building the image.

Source and release: https://github.com/cloudflare/cloudflared/releases/tag/2026.10.7

cloudflared is Copyright Cloudflare, Inc. and contributors, distributed under the accompanying Apache-2.0 LICENSE. These are the unmodified official release executables.

Run `npm run install:cloudflared` in the Node package directory to install/retry manually, or `npm run install:cloudflared --prefix <installed-package-directory>` from elsewhere. Set `MOARTUBE_CLOUDFLARED_PATH` to select another executable. Automatic postinstall skips downloading when this override is set or `MOARTUBE_SKIP_CLOUDFLARED_INSTALL=1`. Downloads require access to GitHub. A failed automatic download warns without blocking Node installation; local HTTP remains available, while tunnels require a working executable. If npm lifecycle scripts are disabled, use the manual retry command. Native Windows arm64 is not included in this upstream release; other architectures require an explicitly installed compatible executable.
