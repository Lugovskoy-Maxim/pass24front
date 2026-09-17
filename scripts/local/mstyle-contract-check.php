<?php
// Offline audit: load function declarations only; no WordPress or database bootstrap.
define('ABSPATH', __DIR__);
function sanitize_key($value) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower($value)); }
function wp_json_encode($value, $flags = 0, $depth = 512) { return json_encode($value, $flags, $depth); }
function add_action(...$args) {}
function add_filter(...$args) {}
function tf_mstyle_pass_config() { return ['identifier_hmac_secret' => str_repeat('local-test-', 4), 'environment' => 'local']; }
$theme = $argv[1] ?? '';
if (!is_dir($theme)) { fwrite(STDERR, "Mstyle theme directory is required\n"); exit(2); }
foreach (['storage', 'client', 'adapters', 'account', 'guest', 'auth', 'admin', 'jobs', 'delivery'] as $part) require $theme . '/inc/pass/' . $part . '.php';
if (($argv[2] ?? '') === '--forms') {
    echo json_encode(['individual' => tf_mstyle_pass_account_private_data([
        'type' => 'individual', 'birth_date' => '1990-01-01',
        'individual_passport_full_name' => 'Локальное физическое лицо',
        'individual_passport_number' => '1234 567890',
    ], 'individual', '')], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit(0);
}
$rows = json_decode(file_get_contents($argv[2]), true, 512, JSON_THROW_ON_ERROR);
$snapshots = [];
foreach ($rows as $row) {
    if ($row['status'] === 201 && isset($row['response']['snapshotId'])) $snapshots[$row['response']['snapshotId']] = $row['response'];
}
$checks = [];
function audit_result($index, $kind, $row, $result) {
    global $checks;
    $checks[] = ['index' => $index, 'kind' => $kind, 'method' => $row['method'], 'route' => $row['route'], 'http' => $row['status'], 'ok' => $result['ok'] ?? false, 'code' => $result['code'] ?? null];
}
foreach ($rows as $index => $row) {
    if ($row['status'] < 200 || $row['status'] >= 300 || !is_array($row['response'])) continue;
    $d = $row['response']; $r = $row['route']; $m = $row['method']; $q = $row['request'] ?? [];
    try {
        if ($m === 'GET' && preg_match('~^/residents/([^/]+)/context$~', $r, $p)) audit_result($index, 'R-01', $row, tf_mstyle_pass_validate_resident_context($d, $p[1]));
        elseif ($m === 'GET' && preg_match('~^/resident-profiles/([^/]+)$~', $r, $p)) audit_result($index, 'R-04', $row, tf_mstyle_pass_validate_safe_profile_response($d, $p[1]));
        elseif ($m === 'GET' && preg_match('~^/resident-profiles/([^/]+)/memberships$~', $r, $p)) audit_result($index, 'M-01', $row, tf_mstyle_pass_validate_membership_roster_response($d, $p[1]));
        elseif ($m === 'POST' && preg_match('~^/resident-profiles/([^/]+)/memberships$~', $r, $p)) audit_result($index, 'M-02', $row, tf_mstyle_pass_account_validate_member_create_result($d, $p[1], $q['expectedRevisions']['membershipSet']));
        elseif (preg_match('~^/resident-profiles/([^/]+)/contact-assignments$~', $r, $p)) {
            audit_result($index, $m === 'PATCH' ? 'C-04' : 'C-03', $row, tf_mstyle_pass_validate_contact_assignment_set($d, $p[1]));

        }
        elseif (preg_match('~^/residents/([^/]+)/contacts/reveal$~', $r, $p)) audit_result($index, 'C-05', $row, tf_mstyle_pass_validate_subject_contacts_reveal_response($d, $p[1], $q['fieldCodes']));
        elseif (preg_match('~^/resident-profiles/([^/]+)/private-data/status$~', $r, $p)) audit_result($index, 'P-01', $row, tf_mstyle_pass_validate_private_status_response($d, $p[1], $d['profileType'], $d['legalForm']));
        elseif (preg_match('~^/resident-profiles/([^/]+)/private-data/reveal$~', $r, $p)) {
            audit_result($index, 'P-02', $row, tf_mstyle_pass_validate_private_reveal_response($d, $p[1], $d['profileType'], $d['legalForm'], $q['fieldCodes']));

        }
        elseif ($m === 'PATCH' && preg_match('~^/resident-profiles/([^/]+)/private-data$~', $r, $p)) audit_result($index, 'P-03', $row, tf_mstyle_pass_account_validate_private_update_result($d, $p[1], $d['status']['profileType'], $d['status']['legalForm'] ?? '', 0, 0));
        elseif (preg_match('~^/resident-profiles/([^/]+)/private-data/snapshots$~', $r, $p)) {
            audit_result($index, 'P-04', $row, tf_mstyle_pass_validate_snapshot_response($d, 'resident_profile', $p[1], $q['expectedSourceRevisions']));

        }
        elseif (preg_match('~^/resident-profiles/([^/]+)/contacts/reveal$~', $r, $p)) audit_result($index, 'P-05', $row, tf_mstyle_pass_validate_profile_contacts_reveal_response($d, $p[1], $q['fieldCodes']));
        elseif ($m === 'POST' && $r === '/guest-parties') audit_result($index, 'G-01', $row, tf_mstyle_pass_guest_validate_create_result($d, true));
        elseif ($m === 'POST' && preg_match('~^/guest-parties/([^/]+)/contact-challenges$~', $r, $p)) audit_result($index, 'G-02', $row, tf_mstyle_pass_guest_validate_challenge_result($d, $q['contactType'] ?? $q['type']));
        elseif ($m === 'POST' && preg_match('~^/guest-parties/([^/]+)/contact-challenges/([^/]+)/verify$~', $r, $p)) {
            $challenge = null;
            foreach ($rows as $previous) if (($previous['response']['challengeId'] ?? '') === $p[2]) { $challenge = $previous; break; }
            $type = $challenge['request']['contactType'] ?? $challenge['request']['type'];
            $flow = ['guest_party_id' => $p[1], 'contact_type' => $type, 'revision' => 1, 'contact_hmac' => tf_mstyle_pass_identifier_hmac($type, tf_mstyle_pass_normalize_contact($type, $challenge['request']['value']))];
            audit_result($index, 'G-03', $row, tf_mstyle_pass_guest_validate_contact_verification($d, $flow));
        }
        elseif ($m === 'GET' && preg_match('~^/guest-parties/([^/]+)/consents$~', $r, $p)) audit_result($index, 'G-13', $row, tf_mstyle_pass_guest_validate_consent_set($d, $p[1]));
        elseif ($m === 'POST' && preg_match('~^/guest-parties/([^/]+)/consents/([^/]+)/accept$~', $r, $p)) {
            $before = null;
            foreach (array_slice($rows, 0, $index) as $previous) if ($previous['method'] === 'GET' && $previous['route'] === '/guest-parties/' . $p[1] . '/consents' && $previous['status'] === 200) $before = $previous['response'];
            $item = array_values(array_filter($before['items'], fn($item) => $item['documentCode'] === $p[2]))[0];
            audit_result($index, 'G-14', $row, tf_mstyle_pass_guest_validate_consent_accept_result($d, $p[1], $item, $before['consentSetRevision']));
        }
        elseif ($m === 'GET' && preg_match('~^/guest-parties/([^/]+)/private-data/status$~', $r, $p)) {
            $intended = null;
            foreach ($rows as $candidate) if ($candidate['method'] === 'PATCH' && $candidate['route'] === '/guest-parties/' . $p[1] . '/private-data' && $candidate['status'] === 200) { $intended = $candidate['request']['privateData']; break; }
            $profileContract = ['profile_type'=>$intended['profileType'] ?? $d['profileType'], 'legal_form'=>$intended['legalForm'] ?? ''];
            audit_result($index, 'G-06 before first save', $row, tf_mstyle_pass_guest_validate_private_status($d, $p[1], $profileContract, false));
            if ($profileContract['profile_type'] === 'company') {
                $wrong = array_replace($d, ['exists'=>true, 'revision'=>1, 'updatedAt'=>'2026-09-10T10:00:00Z']);
                audit_result($index, 'G-06 existing type mismatch rejected', $row, ['ok'=>empty(tf_mstyle_pass_guest_validate_private_status($wrong, $p[1], $profileContract, false)['ok'])]);
            }
        }
        elseif ($m === 'PATCH' && preg_match('~^/guest-parties/([^/]+)/private-data$~', $r, $p)) audit_result($index, 'G-08', $row, tf_mstyle_pass_guest_validate_private_update_result($d, ['guest_party_id'=>$p[1], 'revision'=>1], ['profile_type'=>$q['privateData']['profileType'], 'legal_form'=>$q['privateData']['legalForm'] ?? ''], 0));
        elseif ($m === 'POST' && preg_match('~^/guest-parties/([^/]+)/booking-confirmations$~', $r, $p) && str_starts_with($q['snapshotId'], 'gps_')) audit_result($index, 'G-10', $row, tf_mstyle_pass_outbox_success_contract('G-10', ['guestPartyId'=>$p[1]], $q, $d));
        elseif (preg_match('~^/guest-parties/([^/]+)/snapshots$~', $r, $p)) audit_result($index, 'G-09 format', $row, tf_mstyle_pass_validate_snapshot_response($d, 'guest_party', $p[1], $d['sourceRevisions']));
        elseif (preg_match('~^/private-data-snapshots/([^/]+)/(contacts/)?reveal$~', $r, $p)) {
            $expected = $snapshots[$d['snapshotId']] ?? [];
            if (isset($expected['sourceRevisions'])) $expected['sourceRevisions'] = tf_mstyle_pass_snapshot_canonical_value($expected['sourceRevisions']);
            audit_result($index, empty($p[2]) ? 'P-06' : 'P-07', $row, tf_mstyle_pass_delivery_validate_reveal_response($d, $expected));
        }
        elseif (str_starts_with($r, '/changes')) {
            $previous = null;
            foreach ($d['items'] as $event) {
                $valid = tf_mstyle_pass_reconcile_event_envelope_contract($event, 'local', $d['streamName'], $d['asOfSequence'], $previous);
                if (tf_mstyle_pass_reconcile_event_kind($event) === 'invalid') $valid = ['ok'=>false, 'code'=>'taxonomy_invalid'];
                audit_result($index, 'R-03 ' . $event['type'], $row, $valid);
                $previous = $event['sequence'];
            }
        }
        elseif ($m === 'GET' && preg_match('~^/identities/([^/]+)$~', $r, $p)) audit_result($index, 'R-14', $row, tf_mstyle_pass_validate_safe_identity_response($d, $p[1]));
    } catch (Throwable $e) { audit_result($index, 'HARNESS_ERROR', $row, ['code' => $e->getMessage()]); }
}
$link = ['sourceSystem'=>'mstyle-wordpress','environment'=>'local','entityType'=>'resident','externalId'=>'mstyle-user:42','linkedAt'=>'2026-09-10T08:00:00Z'];
$sourceChecks = [
    'canonical' => tf_mstyle_pass_validate_source_links([$link]),
    'duplicatesRejected' => !tf_mstyle_pass_validate_source_links([$link, $link]),
    'emptyRejected' => !tf_mstyle_pass_validate_source_links([array_replace($link, ['externalId'=>''])]),
];
$old = $link; $old['sourceId'] = $old['externalId']; unset($old['externalId']);
$sourceChecks['wrongFieldRejected'] = !tf_mstyle_pass_validate_source_links([$old]);
$failures = array_values(array_filter($checks, fn($row) => !$row['ok']));
echo json_encode(['checks'=>$checks, 'sourceLinks'=>$sourceChecks, 'failures'=>$failures], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
exit(count($checks) > 0 && !$failures && !in_array(false, $sourceChecks, true) ? 0 : 1);
