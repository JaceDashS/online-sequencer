# Test Environment Setup

**Document Version**: 1.0  
**Software Version**: 0.1.0  
**Last Updated**: 2026-01-14

---

## Test Strategy

Recommended order for testing collaboration features:

```
Phase 1: Test within same NAT
  └─ Two computers connected to the same router
  └─ Connection possible with STUN only (TURN not needed)
  └─ Basic feature verification

Phase 2: Test from different networks
  └─ Use mobile hotspot
  └─ TURN server may be needed
  └─ Simulate real usage environment
```

## Phase 1: Test within Same NAT

### Server Configuration

**Configure server to be accessible from all network interfaces:**

```javascript
// Server code example
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // Instead of localhost

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
  console.log(`Network access: http://[your-ip]:${PORT}`);
});
```

**Check local IP address:**

```bash
# Windows
ipconfig
# Check IPv4 address (e.g., 192.168.0.100)

# Linux/Mac
ifconfig
# or
ip addr show
```

### Client Environment Variable Configuration

**`.env.development` file:**

```env
# Use local IP address of server computer
VITE_COLLABORATION_SERVER_URL=http://192.168.0.100:3000
VITE_COLLABORATION_WS_URL=ws://192.168.0.100:3000
VITE_API_BASE_URL=http://192.168.0.100:3000/api/online-daw
NODE_ENV=development
VITE_APP_ENV=development
VITE_ENABLE_DEBUG_LOGS=true
VITE_ENABLE_WEBRTC_LOGS=true
VITE_ENABLE_COLLABORATION=true
```

**Notes:**
- Server computer and client computer must be on the same network
- Windows Firewall needs to allow port 3000

### Windows Firewall Configuration

**PowerShell (Administrator):**

```powershell
New-NetFirewallRule -DisplayName "Online DAW Server" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

**Or GUI:**
1. Windows Firewall → Advanced Settings
2. Inbound Rules → New Rule
3. Port → TCP → 3000
4. Allow connection

## Phase 2: Test from Different Networks

### Method 1: Use ngrok (Recommended)

**Advantages:**
- Accessible from different networks
- Automatic HTTPS support
- No firewall configuration needed
- Simple setup

**Disadvantages:**
- Free version has 2-hour session limit
- URL changes each time (on restart)

**Setup:**

```bash
# 1. Install ngrok
# https://ngrok.com/download

# 2. Run ngrok
ngrok http 3000

# Output example:
# Forwarding  https://abc123.ngrok.io -> http://localhost:3000
```

**Client environment variables:**

```env
# Use ngrok URL
VITE_COLLABORATION_SERVER_URL=https://abc123.ngrok.io
VITE_COLLABORATION_WS_URL=wss://abc123.ngrok.io
VITE_API_BASE_URL=https://abc123.ngrok.io/api/online-daw
```

**Note:**
- ngrok free version is sufficient for testing
- For production, use actual domain and SSL certificate

### Method 2: Use Local IP Address (Mobile Hotspot)

**Prerequisites:**
- Mobile hotspot and server computer must be on the same network
- Server computer also needs to connect to mobile hotspot

**Configuration:**

```env
# Use local IP address of server computer
VITE_COLLABORATION_SERVER_URL=http://192.168.43.100:3000
VITE_COLLABORATION_WS_URL=ws://192.168.43.100:3000
VITE_API_BASE_URL=http://192.168.43.100:3000/api/online-daw
```

**Notes:**
- Check mobile hotspot's IP range (typically 192.168.43.x)
- Server computer must also be connected to the same hotspot

### Method 3: Port Forwarding (Advanced)

**Router Configuration:**
- Set server computer's local IP as DMZ, or
- Forward port 3000 to server computer

**Client environment variables:**

```env
# Use router's public IP address
VITE_COLLABORATION_SERVER_URL=http://[router public IP]:3000
VITE_COLLABORATION_WS_URL=ws://[router public IP]:3000
VITE_API_BASE_URL=http://[router public IP]:3000/api/online-daw
```

**Notes:**
- Security risk (public IP exposure)
- ISP may block port
- Not recommended for production

## Test Checklist

### Phase 1: Same NAT Test

**Server Configuration:**
- [ ] Server bound to `0.0.0.0:3000`
- [ ] Port 3000 allowed in Windows Firewall
- [ ] Server started successfully

**Client Configuration:**
- [ ] Server IP address set in `.env.development`
- [ ] Client connected to server
- [ ] WebSocket connection successful

**Feature Testing:**
- [ ] Host clicks "Host" button → Room code generated
- [ ] Host clicks "Allow Join" button → 60-second countdown starts
- [ ] Guest joins with room code → Warning message confirmed
- [ ] WebRTC P2P connection established (STUN only)
- [ ] Project state synchronization works
- [ ] MIDI event synchronization works
- [ ] Channel volume/panning/effects synchronization works

### Phase 2: Different Network Test

**Network Configuration:**
- [ ] ngrok or port forwarding configured
- [ ] Server accessible (verified in browser)

**Feature Testing:**
- [ ] Connected via mobile hotspot
- [ ] Server accessible
- [ ] WebRTC P2P connection established (TURN may be needed)
- [ ] All synchronization features work
- [ ] Latency checked (P2P direct communication)

## Network Diagnostic Tools

### Check WebRTC Connection Status

```javascript
// Run in browser console
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
});

pc.oniceconnectionstatechange = () => {
  console.log('ICE connection state:', pc.iceConnectionState);
};

pc.onicegatheringstatechange = () => {
  console.log('ICE gathering state:', pc.iceGatheringState);
};

pc.onicecandidate = (event) => {
  if (event.candidate) {
    console.log('ICE candidate:', event.candidate);
  }
};
```

### Test Server Connection

```bash
# Check if server is running
curl http://localhost:3000/api/online-daw/rooms

# Check if accessible from network
curl http://192.168.0.100:3000/api/online-daw/rooms
```

## Troubleshooting

### Cannot Connect to Server

1. **Verify server is bound to `0.0.0.0`**
2. **Check firewall settings** (port 3000 allowed)
3. **Verify network connection** (ping test)
4. **Check environment variables** (server IP address is correct)

### WebRTC Connection Failed

1. **Check STUN server** (uses Google STUN by default)
2. **Determine if TURN server is needed** (symmetric NAT)
3. **Check browser console for errors**
4. **Verify ICE candidate collection**

### Synchronization Not Working

1. **Check P2P connection status** (`iceConnectionState === 'connected'`)
2. **Check DataChannel status** (`readyState === 'open'`)
3. **Check message send/receive logs**
4. **Verify project state version**

## Recommended Test Order

1. **Same NAT**: Verify basic features (STUN only)
2. **ngrok**: Simulate real environment from different networks
3. **Production**: Final test after actual server deployment

**Note:** ngrok is the simplest and safest method. The free version is sufficient for testing.

---

