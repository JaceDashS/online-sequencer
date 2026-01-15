# Server Resource Management Details

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

---

## Room Creation Timing

- **Host clicks "Host" button**: Create room on server (maintained for 6 hours)
- **Host clicks "Allow Join" button**: Allow joining for 60 seconds (can be clicked again anytime to extend or reactivate)

## Room Expiration and Cleanup

- **After 60 seconds**: Join window expires (allowJoin: false), room continues to be maintained
- **After 6 hours**: Server room expires; P2P termination depends on client handling
- **When reconnection is needed**: Host clicks "Host" again → Create new room
- **Work content**: Stored locally, so no loss

## Resource Usage

```
Timing             Server Resource    P2P Connection    Join Allowed
────────────────────────────────────────────────────────────────────
Host Click         ~100 bytes         None             false
Allow Join Click   ~100 bytes         None             true (60s)
Guest Joins        ~100 bytes         Establishing     true
P2P Connected      ~100 bytes         Active           true
After 60 seconds   ~100 bytes         Active           false
After 6 hours      0 bytes            Depends          false
```

---

