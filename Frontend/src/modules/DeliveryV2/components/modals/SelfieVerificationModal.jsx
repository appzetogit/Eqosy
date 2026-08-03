import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, CheckCircle2, AlertTriangle, ShieldCheck, X, RefreshCw, Lock } from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';

export const SelfieVerificationModal = ({ isOpen, onClose, onSuccess }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [verificationResult, setVerificationResult] = useState(null);

  const startCamera = async () => {
    setErrorMsg('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported on this device');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      setErrorMsg(err.message || 'Could not access front camera. Please grant camera permissions.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setVerificationResult(null);
      setErrorMsg('');
    }
    return () => stopCamera();
  }, [isOpen]);

  const captureSelfie = async () => {
    if (!videoRef.current) return;
    setIsVerifying(true);
    setErrorMsg('');

    try {
      const video = videoRef.current;
      const width = video.videoWidth || 720;
      const height = video.videoHeight || 1280;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas rendering failed');

      ctx.drawImage(video, 0, 0, width, height);
      const base64Data = canvas.toDataURL('image/jpeg', 0.85);

      const response = await deliveryAPI.verifySelfie({ base64: base64Data });
      const data = response.data?.data;

      if (data?.verified) {
        setVerificationResult(data);
        toast.success('Identity verified successfully!');
        stopCamera();
        setTimeout(() => {
          if (onSuccess) onSuccess(data);
        }, 1200);
      } else {
        setVerificationResult(data);
        setErrorMsg(data?.message || 'Selfie verification failed');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Verification error';
      setErrorMsg(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[450] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 pointer-events-auto"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="w-full max-w-sm bg-slate-950 text-white rounded-[2.5rem] border border-slate-800 shadow-2xl p-6 relative overflow-hidden flex flex-col items-center text-center"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-9 h-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">Live Verification</span>
          </div>
          <h2 className="text-xl font-black tracking-tight text-white mb-2">Verify Your Identity</h2>
          <p className="text-xs font-semibold text-slate-400 mb-5 leading-relaxed px-2">
            Position your face inside the oval guide below and tap capture to verify identity before going online.
          </p>

          {/* Camera View Finder */}
          <div className="w-64 h-80 rounded-[2rem] bg-slate-900 border-2 border-emerald-500/40 relative overflow-hidden flex items-center justify-center shadow-inner my-2">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />

            {/* Oval Face Overlay */}
            <div className="absolute inset-0 border-[36px] border-slate-950/70 rounded-[2.5rem] pointer-events-none flex items-center justify-center">
              <div className="w-44 h-56 rounded-[50%] border-2 border-dashed border-emerald-400/80 animate-pulse shadow-lg" />
            </div>

            {/* Verification Status Overlay */}
            {isVerifying && (
              <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400">Verifying Face Match...</span>
              </div>
            )}

            {verificationResult?.verified && (
              <div className="absolute inset-0 bg-emerald-950/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                <CheckCircle2 className="w-16 h-16 text-emerald-400 animate-bounce" />
                <span className="text-sm font-black uppercase tracking-widest text-emerald-300">Identity Verified ✓</span>
                <span className="text-[10px] font-bold text-emerald-200">Match Score: {verificationResult.matchScore}%</span>
              </div>
            )}
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="w-full my-3 p-3 rounded-2xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs font-bold flex items-center gap-2 text-left">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="w-full mt-4 space-y-2">
            {!verificationResult?.verified && (
              <button
                onClick={captureSelfie}
                disabled={isVerifying || !cameraActive}
                className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                <span>Take Live Selfie</span>
              </button>
            )}

            {!cameraActive && (
              <button
                onClick={startCamera}
                className="w-full py-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 font-bold text-xs uppercase tracking-wider hover:bg-slate-800 flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Camera</span>
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
