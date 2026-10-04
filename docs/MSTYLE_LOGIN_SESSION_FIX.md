# Mstyle login: session before protected operations

The WordPress theme builds the booking context after successful `A-06` code verification and resident context validation. With `TF_MSTYLE_OPERATIONS_OWNER=pass`, profile settings call `profile.policy`, and the available hours call `hours.get`. Both go through `tf_mstyle_ops_session()`, which requires the local booking session cookie.

The supplied theme built this context before creating the cookie. A first login therefore threw `Необходима авторизация в Pass.` even though Pass had already verified and consumed the code. An existing cookie could also make these reads use an earlier session.

The patch in `scripts/mstyle/patches/auth-session-order.patch` changes the theme's `inc/pass/auth.php`. The login flow now validates the code and resident binding, closes the one-time flow, creates the resident session, and only then reads profile settings and hours. A context exception or failed settings result revokes the newly created session and clears its cookie before returning an error. Authentication checks and the operation guard remain unchanged.

## Apply to the WordPress theme

This repository deploys Pass, not the WordPress theme. Deploying Pass alone does not install this patch on mstyle.ru.

From the theme root, review and apply the patch:

```powershell
git apply --check C:/path/to/pass24front/scripts/mstyle/patches/auth-session-order.patch
git apply C:/path/to/pass24front/scripts/mstyle/patches/auth-session-order.patch
```

For a file-manager deployment, back up and replace only `inc/pass/auth.php` in the active theme. Clear PHP OPcache using the hosting provider's supported mechanism if necessary. Confirm login in a fresh private browser window with a newly requested code, then check the account, selected profiles, and hours balance. Previously consumed codes cannot be reused.

## Offline regression

`scripts/local/check-mstyle-login.php` loads the real theme authentication, booking context, operations, and session functions. It replaces only the HTTP and WordPress storage boundaries with synthetic fixtures. It sends no SMS, calls no production API, and prints no tokens or personal data.

```powershell
$themePath = 'C:/path/to/mstyle-main'
$phpBinary = 'C:/path/to/php.exe'
foreach ($scenario in @('success', 'existing_session', 'invalid_code', 'context_subject_mismatch', 'context_version_mismatch', 'inactive_identity', 'no_active_profile', 'flow_failure', 'insert_failure', 'cookie_failure', 'policy_failure', 'hours_failure', 'settings_failure', 'anonymous')) {
    & $phpBinary -n scripts/local/check-mstyle-login.php $themePath $scenario
    if ($LASTEXITCODE -ne 0) { throw "Failed scenario: $scenario" }
}
```

The original supplied theme reproduces the exact authorization error in `success`. The patched theme passes all 14 scenarios under PHP 8.3.35, including creation failures, revocation on context failure, rejection of inconsistent authentication data, and preservation of the anonymous operation guard. These offline checks do not confirm that the updated file is deployed or that a real SMS login succeeds on the live site.
