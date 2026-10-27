# Releasing MacroMaxx

## First release: v0.1.0

The release workflow requires GitHub Actions to be enabled. No signing secrets or
personal access token are needed: only the draft job receives `contents: write`
through GitHub's built-in token. Repository/organization policy must allow this.

1. Commit and push the release preparation, including `.github/workflows`,
   `CHANGELOG.md`, scripts and package files. Wait for CI to pass on that commit.
2. Check that `package.json`, both root lockfile versions and the changelog all
   describe `0.1.0`. Run `npm run release:check` locally.
3. Tag that tested commit and push the tag:

   ```sh
   git tag -a v0.1.0 -m "MacroMaxx v0.1.0"
   git push origin v0.1.0
   ```

4. Follow **Actions → Release**. The workflow repeats version, formatting, test
   and build checks, then builds on native runners:

   | Runner | Architecture | Installer |
   | --- | --- | --- |
   | Ubuntu 24.04 | x64 | AppImage |
   | Windows Server 2022 | x64 | NSIS `.exe` |
   | macOS 14 | ARM64 / Apple Silicon | `.dmg` |

   The Linux x64 AppImage uses `x86_64` in its filename (electron-builder's naming).

5. Only after all installer jobs succeed, the workflow creates a **draft** GitHub
   Release with three installers, `SHA256SUMS.txt` and the matching changelog
   section. Individual workflow artifacts are retained for 14 days; attached
   release assets are independent of that retention period.
6. Download the installers from the draft and run the smoke tests below. Review
   the notes and publish the draft manually when satisfied. For an external
   preview, consider GitHub's **Set as a pre-release** option.

The workflow never auto-publishes, overwrites an existing release, signs/notarizes,
or configures an updater. It accepts stable-shaped tags (`vMAJOR.MINOR.PATCH`)
only. Do not reuse tags for different commits.

## Failed runs and retries

Before a draft exists, use GitHub's **Re-run failed jobs** on the original run.
If a draft already exists, creation fails rather than replacing its assets. Review
that draft before deciding whether to remove it manually and retry. Never delete
or replace an already published release/tag to ship a fix; increment the version.

## Minimum release smoke tests

- Verify the checksums (Linux: `sha256sum -c SHA256SUMS.txt`; macOS:
  `shasum -a 256 -c SHA256SUMS.txt`; Windows: `Get-FileHash <installer> -Algorithm SHA256`).
- Install and launch on each target OS/architecture, including a clean user setup.
- Connect the deck; test a key, folder, profile and live artwork change.
- Unplug/reconnect USB; suspend/resume; hide/reopen the app.
- Exercise supported keyboard, OBS and audio actions, including missing permissions.
- Quit while a key/hold or sound is active; confirm cleanup.
- Test workspace persistence, import/export and preservation of existing data.

## Future versions and signing

Use `npm version patch --no-git-tag-version` (or `minor`) to update package and
lockfile versions, add the matching changelog section, commit, run CI, then tag.

The current unsigned preview needs no private credentials but may be blocked by
OS security checks. Before wider Windows/macOS distribution, implement Windows
code signing and Apple Developer ID signing plus notarization. Keep credentials
in protected GitHub Environments/Secrets, not repository files. Intel Macs and
other architectures require separate native build jobs, asset validation and
smoke tests. Auto-updates require a separate design and update metadata; checksums
alone do not authenticate downloads if the release itself is compromised.
