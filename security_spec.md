# Security Specification: CivicPulse Firestore Security

## 1. Data Invariants
1. **User Identity Invariant**: A user document at `/users/{userId}` can only be created by the authenticated user whose `request.auth.uid == userId`. No user may assign themselves the `admin` role in their own profile.
2. **Issue Authorship Invariant**: When an issue is created, `incoming().citizenId` must strictly equal `request.auth.uid`. Once created, `citizenId` and `createdAt` are immutable.
3. **Sub-resource Membership Invariant**: Sub-collections `/issues/{issueId}/timeline` and `/issues/{issueId}/notes` can only be appended to if the parent `/issues/{issueId}` exists.
4. **Administrative Escalation Invariant**: Administrative capabilities are strictly verified via `/admins/$(request.auth.uid)` or authenticated verified runtime admin (`bhagadetanuja5@gmail.com`).
5. **Notification Isolation Invariant**: Notifications at `/notifications/{notificationId}` can only be read or modified by the designated recipient (`userId == request.auth.uid`).

## 2. The Dirty Dozen Payloads (Negative Security Tests)
1. **Ghost Field Escalation**: Citizen profile creation containing `role: "admin"` attempting self-promotion. (Must reject)
2. **Identity Spoofing**: Issue creation payload where `citizenId: "other_user_id"` differs from `request.auth.uid`. (Must reject)
3. **Immutable Field Mutability**: Update payload attempting to alter `citizenId` or `createdAt` on an existing issue. (Must reject)
4. **Terminal State Re-opening by Unprivileged User**: Citizen attempting to overwrite status from `RESOLVED` directly without verification flow. (Must reject)
5. **Path ID Poisoning**: Document creation with ID containing directory traversal or non-alphanumeric junk (`../../etc`). (Must reject)
6. **Denial of Wallet Payload**: 500KB text injected into `title` or `description`. (Must reject)
7. **PII Exposure via List Query**: Non-admin attempting to list entire `/users` collection. (Must reject)
8. **Orphaned Timeline Creation**: Creating an issue timeline event under a non-existent `issueId`. (Must reject)
9. **Notification Snoop**: Citizen A querying notifications belonging to Citizen B. (Must reject)
10. **Audit Log Tampering**: Non-admin attempting to delete or overwrite `/audit_logs` entries. (Must reject)
11. **Admin Lookup Spoofing**: Non-admin creating a document inside `/admins/`. (Must reject)
12. **Unauthenticated Mutation**: Any write attempt by an unauthenticated client (`request.auth == null`). (Must reject)
