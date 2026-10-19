import React, { useRef, useState } from 'react';
import { Banknote, Camera, CheckCircle2, Loader2 } from 'lucide-react';
import { uploadService } from '../../../shared/services/uploadService';

/**
 * Parcel safety checklist for the captain: a mandatory photo and, when cash is
 * due at this step, a confirmation that the amount was collected.
 */
const ParcelProofPanel = ({
  title,
  photoLabel,
  photoUrl,
  onPhotoUploaded,
  cashAmountLabel,
  cashFrom,
  cashCollected,
  onCashCollected,
}) => {
  const inputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [isSavingCash, setIsSavingCash] = useState(false);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setIsUploading(true);
      setError('');
      const uploaded = await uploadService.uploadImageFile(file, 'parcel-proof');
      const url = uploaded?.url || uploaded?.data?.url;
      if (!url) throw new Error('Upload failed');
      await onPhotoUploaded(url);
    } catch (uploadError) {
      setError(uploadError?.message || 'Could not upload the photo. Try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCash = async () => {
    try {
      setIsSavingCash(true);
      setError('');
      await onCashCollected();
    } catch (cashError) {
      setError(cashError?.message || 'Could not save. Try again.');
    } finally {
      setIsSavingCash(false);
    }
  };

  return (
    <div className="mb-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">{title}</p>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white text-slate-500"
        >
          {photoUrl ? (
            <img src={photoUrl} alt={photoLabel} className="h-full w-full object-cover" />
          ) : isUploading ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <Camera size={20} />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-black text-slate-900">{photoLabel}</p>
          <p className={`mt-0.5 text-[10px] font-bold ${photoUrl ? 'text-emerald-600' : 'text-amber-600'}`}>
            {photoUrl ? 'Photo uploaded. Tap to retake.' : isUploading ? 'Uploading...' : 'Required. Tap to take a photo.'}
          </p>
        </div>
        {photoUrl ? <CheckCircle2 size={20} className="shrink-0 text-emerald-500" /> : null}
        <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      </div>

      {cashAmountLabel ? (
        <button
          type="button"
          onClick={handleCash}
          disabled={cashCollected || isSavingCash}
          className={`mt-3 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${cashCollected ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}
        >
          <Banknote size={18} className={cashCollected ? 'text-emerald-600' : 'text-amber-600'} />
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-black text-slate-900">
              {cashCollected ? `Cash collected from ${cashFrom}` : `Collect ${cashAmountLabel} from the ${cashFrom}`}
            </span>
            <span className="block text-[10px] font-bold text-slate-500">
              {cashCollected ? 'Thanks, you can continue.' : 'Tap once the cash is in your hand.'}
            </span>
          </span>
          {isSavingCash ? <Loader2 size={16} className="animate-spin text-slate-500" /> : null}
          {cashCollected ? <CheckCircle2 size={18} className="text-emerald-500" /> : null}
        </button>
      ) : null}

      {error ? <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-red-500">{error}</p> : null}
    </div>
  );
};

export default ParcelProofPanel;
