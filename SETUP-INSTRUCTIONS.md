# OpenSideline GitHub setup files

The initial repository upload included the application code, but the hidden `.github` directory and `.gitignore` file were missing as checked on November 4, 2026.

Upload the CONTENTS of this extracted folder to the root of https://github.com/CamboBuilt/OpenSideline, preserving the directory structure:

- `.gitignore`
- `.github/workflows/tests.yml`
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/PULL_REQUEST_TEMPLATE.md`

GitHub Actions workflows may require separate permission to be created/modified. If GitHub blocks the workflow upload, it can be created manually in the repository's Actions tab / web file editor.

After upload, check the repository Actions tab for the Node.js test workflow. The project can also be tested locally with `npm test` (Node.js 20+).
