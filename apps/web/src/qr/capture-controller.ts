import { fixedFailure, QR_OK, refuse, type QrAppCode, type QrAppResult } from './protocol.ts';
export interface CameraTrack { stop(): void }
export interface CameraStream { getTracks(): CameraTrack[] }
export interface CameraSnapshot { readonly state: 'idle' | 'requesting' | 'live' | 'error'; readonly error: QrAppCode | null }
export interface CameraCaptureOptions<S extends CameraStream> { request(): Promise<S>; attach(stream: S): void; detach(): void }
let permissionOwner: object | null = null;
function stop(stream: CameraStream | null): void {
  if (!stream) return;
  try { for (const track of stream.getTracks()) { try { track.stop(); } catch { /* Stop all other tracks. */ } } } catch { /* Native stream failure. */ }
}
export function createCameraCapture<S extends CameraStream>(options: CameraCaptureOptions<S>) {
  let epoch = 0, disposed = false, activeStream: S | null = null, activeOwner: object | null = null;
  let snapshot: CameraSnapshot = Object.freeze({ state: 'idle', error: null });
  const listeners = new Set<() => void>();
  const publish = (state: CameraSnapshot['state'], error: QrAppCode | null = null) => {
    snapshot = Object.freeze({ state, error });
    for (const listener of listeners) { try { listener(); } catch { /* An observer cannot own the camera. */ } }
  };
  const detach = () => { try { options.detach(); } catch { /* Cleanup cannot retain tracks or admission. */ } };
  const cancel = () => {
    epoch++; stop(activeStream); activeStream = null; detach();
    if (activeOwner !== null && permissionOwner === activeOwner) permissionOwner = null;
    activeOwner = null; publish('idle');
  };
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async start(): Promise<QrAppResult> {
      const generation = epoch;
      let owned: object | null = null, obtained: S | null = null;
      try {
        if (disposed) refuse('CANCELLED');
        if (permissionOwner !== null || activeStream !== null) refuse('BUSY');
        owned = {}; permissionOwner = owned; publish('requesting');
        if (disposed || generation !== epoch) refuse('CANCELLED');
        try { obtained = await options.request(); } catch { refuse('CAMERA_UNAVAILABLE'); }
        if (disposed || generation !== epoch) refuse('CANCELLED');
        try { options.attach(obtained); } catch { refuse('CAMERA_UNAVAILABLE'); }
        if (disposed || generation !== epoch) refuse('CANCELLED');
        activeStream = obtained; obtained = null; activeOwner = owned; owned = null;
        publish('live'); return QR_OK;
      } catch (error) {
        stop(obtained); if (obtained) detach();
        const failure = fixedFailure(error);
        if (!disposed && generation === epoch && failure.code !== 'BUSY') publish('error', failure.code);
        return failure;
      } finally { if (owned !== null && permissionOwner === owned) permissionOwner = null; }
    },
    cancel,
    dispose() { if (disposed) return; disposed = true; cancel(); listeners.clear(); },
  });
}
