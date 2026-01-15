# Star Topology Details

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

---

## Connection Structure

```
        Host (Center)
       /  |  \
      /   |   \
  Guest1 Guest2 Guest3
```

## Communication Flow

1. **Guest → Host**: All guests connect directly only to the host
2. **Host → Guests**: Host broadcasts changes to all guests
3. **Guest-to-Guest Communication**: Via host (no direct connection)

## Advantages

- Simple implementation: Each guest manages connection only to the host
- Centralized synchronization: Host manages project state as a single source
- Easy conflict resolution: Host resolves conflicts centrally
- Easy to scale: New guests connect only to the host

---

