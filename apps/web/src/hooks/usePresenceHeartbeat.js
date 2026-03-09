'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePresenceHeartbeat = usePresenceHeartbeat;
const react_1 = require("react");
const socket_1 = require("../lib/socket");
function usePresenceHeartbeat(agentId) {
    const intervalRef = (0, react_1.useRef)();
    (0, react_1.useEffect)(() => {
        if (!agentId || !socket_1.socket)
            return;
        const sendHeartbeat = () => {
            try {
                socket_1.socket.emit('agent:heartbeat', { agentId, ts: Date.now() });
            }
            catch (err) {
                console.warn('Heartbeat failed:', err);
            }
        };
        // Join agent room and send initial heartbeat
        try {
            socket_1.socket.emit('agent:join', agentId);
            sendHeartbeat();
        }
        catch (err) {
            console.warn('Join failing:', err);
        }
        intervalRef.current = setInterval(sendHeartbeat, 30_000);
        return () => {
            clearInterval(intervalRef.current);
            try {
                socket_1.socket.emit('presence:update', { agentId, status: 'OFFLINE' });
            }
            catch { /* ignore on cleanup */ }
        };
    }, [agentId]);
}
