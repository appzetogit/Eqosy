import React, { useEffect, useMemo, useState } from 'react';
import { 
    ArrowLeft, 
    Camera, 
    CheckCircle2, 
    FileText, 
    ImagePlus,
    ShieldCheck, 
    AlertCircle,
    ChevronRight,
    UploadCloud,
    X,
    RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  clearDriverRegistrationSession,
  completeDriverOnboarding,
  getDriverDocumentTemplates,
  getStoredDriverRegistrationSession,
  persistDriverAuthSession,
  saveDriverDocuments,
  saveDriverRegistrationSession,
} from '../../services/registrationService';
import {
  flattenDriverDocumentFields,
  getDocumentPreviewUrl,
  normalizeDriverDocumentTemplates,
} from '../../utils/documentTemplates';

const unwrap = (response) => response?.data?.data || response?.data || response;

const normalizeDocument = (doc) => {
  if (!doc) {
    return null;
  }

  if (typeof doc === 'string') {
    return {
      previewUrl: doc,
      secureUrl: doc,
      uploaded: true,
    };
  }

  return {
    ...doc,
    previewUrl: getDocumentPreviewUrl(doc),
    uploaded: doc.uploaded ?? Boolean(getDocumentPreviewUrl(doc)),
    identifyNumber: String(doc.identifyNumber || doc.identify_number || doc.documentNumber || doc.document_number || '').trim(),
    expiryDate: String(doc.expiryDate || doc.expiry_date || doc.expiry || doc.expiresAt || '').trim(),
  };
};

const getDocumentIdentifyValue = (doc) =>
  String(doc?.identifyNumber || doc?.identify_number || doc?.documentNumber || doc?.document_number || '').trim();

const getDocumentExpiryValue = (doc) =>
  String(doc?.expiryDate || doc?.expiry_date || doc?.expiry || doc?.expiresAt || '').trim();

const buildTemplateMetaState = (templates = [], documents = {}) =>
  Object.fromEntries(
    templates.map((template) => {
      const templateFields = Array.isArray(template.fields) ? template.fields : [];
      const firstDocument = templateFields
        .map((field) => normalizeDocument(documents?.[field.key]))
        .find(Boolean);

      return [
        template.id,
        {
          identifyNumber: getDocumentIdentifyValue(firstDocument),
          expiryDate: getDocumentExpiryValue(firstDocument),
        },
      ];
    }),
  );

const formatMetaLabel = (value) =>
  String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

const normalizeSignupRole = (role) =>
  String(role || 'driver').toLowerCase() === 'owner' ? 'owner' : 'driver';

const matchesDocumentRole = (accountType, role) => {
  const rawAccountType = String(accountType || '').trim().toLowerCase();
  const normalizedAccountType = rawAccountType || 'individual';
  const normalizedRole = normalizeSignupRole(role);

  if (normalizedAccountType === 'both') {
    return true;
  }

  if (normalizedRole === 'owner') {
    if (!rawAccountType) {
      return true;
    }

    return ['fleet_drivers', 'owner', 'owners', 'fleet_owner', 'fleet_owners'].includes(normalizedAccountType);
  }

  return normalizedAccountType === 'individual';
};

const isImageLikeFile = (file) => {
  if (!file) {
    return false;
  }

  if (String(file.type || '').startsWith('image/')) {
    return true;
  }

  return /\.(jpg|jpeg|png|webp|heic|heif|bmp|gif)$/i.test(String(file.name || ''));
};

const inferImageMeta = (file, dataUrl) => {
  const mimeMatch = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);
  const mimeType = String(file?.type || mimeMatch?.[1] || 'image/jpeg').toLowerCase();
  const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  const originalName = String(file?.name || '').trim();

  return {
    mimeType,
    fileName: originalName || `capture-${Date.now()}.${extension}`,
  };
};

const DEFAULT_DRIVER_DOCUMENT_TEMPLATES = [
  {
    id: 'driving_license',
    name: 'Driving License',
    account_type: 'both',
    is_required: true,
    has_identify_number: true,
    identify_number_key: 'driving_license_number',
    has_expiry_date: true,
    fields: [
      { key: 'dl_front', label: 'Driving License (Front Side)', required: true },
      { key: 'dl_back', label: 'Driving License (Back Side)', required: true },
    ],
  },
  {
    id: 'aadhaar_card',
    name: 'Aadhaar Card',
    account_type: 'both',
    is_required: true,
    has_identify_number: true,
    identify_number_key: 'aadhaar_number',
    has_expiry_date: false,
    fields: [
      { key: 'aadhaar_front', label: 'Aadhaar Card (Front Side)', required: true },
      { key: 'aadhaar_back', label: 'Aadhaar Card (Back Side)', required: true },
    ],
  },
  {
    id: 'pan_card',
    name: 'PAN Card',
    account_type: 'both',
    is_required: true,
    has_identify_number: true,
    identify_number_key: 'pan_number',
    has_expiry_date: false,
    fields: [
      { key: 'pan_front', label: 'PAN Card (Front Side)', required: true },
      { key: 'pan_back', label: 'PAN Card (Back Side)', required: true },
    ],
  },
  {
    id: 'bank_passbook',
    name: 'Bank Account Passbook',
    account_type: 'both',
    is_required: true,
    has_identify_number: true,
    identify_number_key: 'account_number',
    has_expiry_date: false,
    fields: [
      { key: 'passbook_front', label: 'Bank Account Passbook / Cancelled Cheque Photo', required: true },
    ],
  },
];

const StepDocuments = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const session = {
    ...getStoredDriverRegistrationSession(),
    ...(location.state || {}),
  };
  const normalizedRole = normalizeSignupRole(session.role);

  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [docs, setDocs] = useState(() =>
    Object.fromEntries(
      Object.entries(session.documents || {}).map(([key, value]) => [key, normalizeDocument(value)]),
    ),
  );
  const [documentMeta, setDocumentMeta] = useState({});
  const [uploading, setUploading] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submittedAttempted, setSubmittedAttempted] = useState(false);

  useEffect(() => {
    const loadTemplates = async () => {
      setTemplatesLoading(true);

      try {
        const response = await getDriverDocumentTemplates(normalizedRole);
        const results = response?.data?.data?.results || response?.data?.results || [];
        const normalizedRemote = normalizeDriverDocumentTemplates(results);

        const mergedTemplates = [...normalizedRemote];
        for (const defaultTemplate of DEFAULT_DRIVER_DOCUMENT_TEMPLATES) {
          const hasMatch = mergedTemplates.some((item) => {
            const itemId = String(item.id || item.slug || '').toLowerCase();
            const itemName = String(item.name || '').toLowerCase();
            return (
              itemId.includes(defaultTemplate.id) ||
              itemName.includes(defaultTemplate.name.toLowerCase()) ||
              (defaultTemplate.id === 'aadhaar_card' && (itemId.includes('adhaar') || itemName.includes('adhaar') || itemId.includes('aadhaar') || itemName.includes('aadhaar'))) ||
              (defaultTemplate.id === 'pan_card' && (itemId.includes('pan') || itemName.includes('pan'))) ||
              (defaultTemplate.id === 'driving_license' && (itemId.includes('license') || itemName.includes('license') || itemId.includes('dl')))
            );
          });
          if (!hasMatch) {
            mergedTemplates.push(defaultTemplate);
          }
        }

        setTemplates(mergedTemplates);
      } catch {
        setTemplates(DEFAULT_DRIVER_DOCUMENT_TEMPLATES);
      } finally {
        setTemplatesLoading(false);
      }
    };

    loadTemplates();
  }, [normalizedRole]);

  const documentTemplates = useMemo(
    () =>
      normalizeDriverDocumentTemplates(templates).filter((template) =>
        matchesDocumentRole(template.account_type, normalizedRole),
      ),
    [normalizedRole, templates],
  );
  const uploadFields = useMemo(
    () => flattenDriverDocumentFields(documentTemplates),
    [documentTemplates],
  );
  const requiredUploadFields = useMemo(
    () => uploadFields.filter((item) => Boolean(item.isRequired)),
    [uploadFields],
  );
  const templateFieldMap = useMemo(
    () =>
      Object.fromEntries(
        documentTemplates.map((template) => [template.id, Array.isArray(template.fields) ? template.fields : []]),
      ),
    [documentTemplates],
  );

  useEffect(() => {
    setDocumentMeta((current) => ({
      ...buildTemplateMetaState(documentTemplates, docs),
      ...current,
    }));
  }, [documentTemplates, docs]);

  const applyTemplateMetaToDocuments = (templateId, templateDocuments, metaOverride = null) => {
    const meta = metaOverride || documentMeta[templateId] || { identifyNumber: '', expiryDate: '' };
    const identifyNumber = String(meta.identifyNumber || '').trim();
    const expiryDate = String(meta.expiryDate || '').trim();

    return Object.fromEntries(
      Object.entries(templateDocuments).map(([docKey, docValue]) => [
        docKey,
        docValue
          ? {
              ...docValue,
              identifyNumber,
              identify_number: identifyNumber,
              documentNumber: identifyNumber,
              document_number: identifyNumber,
              expiryDate,
              expiry_date: expiryDate,
            }
          : docValue,
      ]),
    );
  };

  const handleMetaChange = (templateId, fieldName, nextValue) => {
    let formattedValue = nextValue;
    const template = documentTemplates.find((t) => t.id === templateId);
    const id = String(templateId || '').toLowerCase();
    const name = String(template?.name || '').toLowerCase();

    if (fieldName === 'identifyNumber') {
      if (id.includes('aadhaar') || id.includes('adhaar') || name.includes('aadhaar') || name.includes('adhaar')) {
        const digits = String(nextValue || '').replace(/\D/g, '').slice(0, 12);
        formattedValue = digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
      } else if (id.includes('pan') || name.includes('pan')) {
        formattedValue = String(nextValue || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
      }
    }

    const nextMeta = {
      ...(documentMeta[templateId] || {}),
      [fieldName]: formattedValue,
    };

    setDocumentMeta((current) => ({
      ...current,
      [templateId]: nextMeta,
    }));

    const templateFields = templateFieldMap[templateId] || [];
    if (templateFields.length === 0) {
      return;
    }

    setDocs((current) => {
      const nextDocuments = { ...current };
      for (const field of templateFields) {
        if (!nextDocuments[field.key]) {
          continue;
        }

        nextDocuments[field.key] = applyTemplateMetaToDocuments(
          templateId,
          { [field.key]: nextDocuments[field.key] },
          nextMeta,
        )[field.key];
      }
      return nextDocuments;
    });
  };

  const [activeCameraTarget, setActiveCameraTarget] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [cameraLoading, setCameraLoading] = useState(false);
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const fileInputRefs = React.useRef({});

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const processDataUrlUpload = async (templateId, key, dataUrl, fileNameOverride = '') => {
    setUploading(key);
    setError('');

    try {
      if (!String(dataUrl || '').startsWith('data:image/')) {
        throw new Error('Please upload an image file');
      }

      const mimeType = 'image/jpeg';
      const fileName = fileNameOverride || `capture-${key}-${Date.now()}.jpg`;

      setDocs((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          previewUrl: dataUrl,
          fileName,
          mimeType,
          uploaded: false,
          uploading: true,
        },
      }));

      const response = await saveDriverDocuments({
        registrationId: session.registrationId,
        phone: session.phone,
        documents: {
          [key]: {
            dataUrl,
            fileName,
            mimeType,
            identifyNumber: documentMeta[templateId]?.identifyNumber || '',
            expiryDate: documentMeta[templateId]?.expiryDate || '',
          },
        },
      });
      const payload = unwrap(response);

      const uploadedDoc = payload?.documents?.[key] || payload?.session?.documents?.[key];
      const nextDoc = normalizeDocument(uploadedDoc) || {
        previewUrl: dataUrl,
        secureUrl: dataUrl,
        fileName,
        mimeType,
        uploaded: true,
      };
      const nextDocWithMeta = applyTemplateMetaToDocuments(templateId, { [key]: nextDoc })[key];

      setDocs((prev) => ({
        ...prev,
        [key]: nextDocWithMeta,
      }));

      const storedSession = getStoredDriverRegistrationSession();
      saveDriverRegistrationSession({
        ...storedSession,
        ...session,
        documents: {
          ...(storedSession.documents || {}),
          [key]: nextDocWithMeta,
        },
      });
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload document');
      setDocs((prev) => ({
        ...prev,
        [key]: normalizeDocument(session.documents?.[key]),
      }));
    } finally {
      setUploading(null);
    }
  };

  const handleFileChange = async (templateId, key, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      const { fileName } = inferImageMeta(file, dataUrl);
      await processDataUrlUpload(templateId, key, dataUrl, fileName);
    } catch (readErr) {
      setError(readErr?.message || 'Unable to read selected file');
    }
  };

  const openCameraModal = async (templateId, key, label) => {
    if (uploading) return;

    const fallbackTriggerInput = () => {
      const targetInput = fileInputRefs.current[`camera-${key}`];
      if (targetInput) {
        targetInput.click();
      }
    };

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        setError('');
        setCameraLoading(true);
        stopCameraStream();

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        streamRef.current = stream;
        setActiveCameraTarget({ templateId, key, label });
        setCameraLoading(false);
        return;
      } catch (camErr) {
        console.warn('Live WebRTC camera failed, falling back to file capture:', camErr);
        stopCameraStream();
        setCameraLoading(false);
      }
    }

    fallbackTriggerInput();
  };

  const capturePhotoFromLiveCamera = async () => {
    const video = videoRef.current;
    if (!video || !activeCameraTarget) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setError('Failed to capture frame from camera');
      return;
    }

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    const { templateId, key } = activeCameraTarget;
    stopCameraStream();
    setActiveCameraTarget(null);

    await processDataUrlUpload(templateId, key, dataUrl, `license-${key}-${Date.now()}.jpg`);
  };

  const toggleCameraFacingMode = async () => {
    if (!activeCameraTarget) return;
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);

    try {
      stopCameraStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      console.warn('Unable to toggle camera facing mode:', e);
    }
  };

  const validateDocumentIdentifyNumber = (template, value) => {
    const cleanVal = String(value || '').trim();
    if (!cleanVal) return null;

    const id = String(template?.id || template?.slug || '').toLowerCase();
    const name = String(template?.name || '').toLowerCase();

    if (id.includes('aadhaar') || id.includes('adhaar') || name.includes('aadhaar') || name.includes('adhaar')) {
      const digits = cleanVal.replace(/\D/g, '');
      if (digits.length !== 12) {
        return 'Aadhaar Card number must be exactly 12 digits (e.g. 1234 5678 9012)';
      }
    } else if (id.includes('pan') || name.includes('pan')) {
      const upper = cleanVal.toUpperCase().replace(/\s/g, '');
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(upper)) {
        return 'PAN Card number must be in 10-character format (e.g. ABCDE1234F)';
      }
    } else if (id.includes('license') || id.includes('dl') || name.includes('license')) {
      const cleanDl = cleanVal.replace(/[^A-Za-z0-9]/g, '');
      if (cleanDl.length < 10) {
        return 'Driving License number must be at least 10 characters';
      }
    } else if (id.includes('passbook') || id.includes('bank') || name.includes('account')) {
      const digits = cleanVal.replace(/\D/g, '');
      if (digits.length < 9 || digits.length > 18) {
        return 'Bank Account number must be between 9 and 18 digits';
      }
    }

    return null;
  };



  const isComplete =
    requiredUploadFields.every((item) => Boolean(docs[item.key]?.uploaded || docs[item.key]?.secureUrl)) &&
    documentTemplates.every((template) => {
      if (!template.is_required) {
        return true;
      }

      const meta = documentMeta[template.id] || {};
      const identifyVal = String(meta.identifyNumber || '').trim();
      const hasIdentifyNumber = !template.has_identify_number || (Boolean(identifyVal) && !validateDocumentIdentifyNumber(template, identifyVal));
      const hasExpiryDate = !template.has_expiry_date || Boolean(String(meta.expiryDate || '').trim());
      return hasIdentifyNumber && hasExpiryDate;
    }) &&
    !uploading &&
    !templatesLoading;

  const handleSubmit = async () => {
    setSubmittedAttempted(true);

    if (uploading) {
      setError('Please wait for the current upload to finish');
      return;
    }

    const routePrefix = location.pathname.startsWith('/taxi/owner') ? '/taxi/owner' : '/taxi/driver';

    if (!session.phone) {
      setError('Phone registration is incomplete. Redirecting to Phone step...');
      setTimeout(() => navigate(`${routePrefix}/reg-phone`, { state: session }), 800);
      return;
    }

    if (!session.fullName && !session.personalSession?.fullName) {
      setError('Personal details are incomplete. Redirecting to Step 1...');
      setTimeout(() => navigate(`${routePrefix}/step-personal`, { state: session }), 800);
      return;
    }

    for (const template of documentTemplates) {
      const templateFields = Array.isArray(template.fields) ? template.fields : [];

      for (const field of templateFields) {
        const isRequired = Boolean(field.required ?? field.isRequired ?? template.is_required);
        if (isRequired && !docs[field.key]?.uploaded && !docs[field.key]?.secureUrl) {
          const msg = `Please upload ${field.label || template.name}`;
          setError(msg);
          const el = document.getElementById(`doc-box-${field.key}`) || document.getElementById(`doc-template-${template.id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }
      }

      const meta = documentMeta[template.id] || {};
      const identifyVal = String(meta.identifyNumber || '').trim();

      if (template.has_identify_number) {
        if (!identifyVal && template.is_required) {
          const msg = `Please enter ${formatMetaLabel(template.identify_number_key) || `${template.name} Number`}`;
          setError(msg);
          const el = document.getElementById(`doc-template-${template.id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          const inputEl = fileInputRefs.current[`input-${template.id}`];
          if (inputEl) {
            inputEl.focus();
          }
          return;
        }

        if (identifyVal) {
          const validationError = validateDocumentIdentifyNumber(template, identifyVal);
          if (validationError) {
            setError(validationError);
            const el = document.getElementById(`doc-template-${template.id}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            const inputEl = fileInputRefs.current[`input-${template.id}`];
            if (inputEl) {
              inputEl.focus();
            }
            return;
          }
        }
      }

      if (template.has_expiry_date) {
        const expiryVal = String(meta.expiryDate || '').trim();
        if (!expiryVal && template.is_required) {
          const msg = `Please select Expiry Date for ${template.name}`;
          setError(msg);
          const el = document.getElementById(`doc-template-${template.id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          const inputEl = fileInputRefs.current[`expiry-${template.id}`];
          if (inputEl) {
            inputEl.focus();
          }
          return;
        }
      }
    }

    setLoading(true);
    setError('');

    try {
      const submittedDocuments = Object.fromEntries(
        Object.entries(docs).filter(([, value]) => Boolean(value?.uploaded || value?.secureUrl)),
      );
      const submittedDocumentsWithMeta = { ...submittedDocuments };

      for (const template of documentTemplates) {
        const templateFields = Array.isArray(template.fields) ? template.fields : [];
        const templateDocuments = Object.fromEntries(
          templateFields
            .filter((field) => submittedDocumentsWithMeta[field.key])
            .map((field) => [field.key, submittedDocumentsWithMeta[field.key]]),
        );

        if (Object.keys(templateDocuments).length === 0) {
          continue;
        }

        Object.assign(
          submittedDocumentsWithMeta,
          applyTemplateMetaToDocuments(template.id, templateDocuments),
        );
      }

      const completeResponse = await completeDriverOnboarding({
        registrationId: session.registrationId,
        phone: session.phone,
        documents: submittedDocumentsWithMeta,
      });
      const payload = unwrap(completeResponse);

      const token = payload?.token;
      if (token) {
        const normalizedRole =
          String(session.role || 'driver').toLowerCase() === 'owner' ? 'owner' : 'driver';
        persistDriverAuthSession({ token, role: normalizedRole });
      }

      saveDriverRegistrationSession({
        ...session,
        documents: docs,
        completedRegistration: payload || null,
      });
      clearDriverRegistrationSession();

      navigate('/taxi/driver/registration-status', {
        state: {
          ...session,
          documents: docs,
          completedRegistration: payload || null,
        },
      });
    } catch (submitError) {
      setError(submitError?.message || 'Unable to complete registration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
        className="min-h-screen bg-[linear-gradient(180deg,#f6efe4_0%,#fcfaf6_28%,#ffffff_100%)] px-5 pb-32 pt-8 select-none overflow-x-hidden"
        style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
    >
      <main className="mx-auto max-w-sm space-y-6">
        <header className="space-y-5">
            <div className="flex items-center justify-between">
                <button
                    onClick={() => navigate('/taxi/driver/step-vehicle', { state: session })}
                    className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/70 bg-white/80 text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm transition-transform active:scale-95"
                >
                    <ArrowLeft size={18} strokeWidth={2.5} />
                </button>
                <div className="rounded-full bg-slate-900/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 border border-slate-900/5">
                    Step 4 of 4
                </div>
            </div>

            <section className="space-y-3">
                <div className="flex items-center gap-3">
                     <div className="flex h-11 w-11 items-center justify-center rounded-[1.25rem] bg-slate-900 text-white shadow-xl shadow-slate-900/10">
                        <ShieldCheck size={22} strokeWidth={2.5} />
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 opacity-60">
                        Identity Verification
                    </span>
                </div>
                <h1 className="font-['Outfit'] text-[48px] font-black leading-[1] tracking-[-0.04em] text-slate-900">
                    KYC <span className="text-slate-400">Vault</span>
                </h1>
                <p className="text-[15px] leading-relaxed text-slate-500 font-bold opacity-80 max-w-[28ch]">
                    Upload clear photos of the required documents to verify your identity.
                </p>
            </section>
        </header>

        {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 shadow-[0_10px_30px_rgba(244,63,94,0.08)]">
                {error}
            </div>
        )}

        <div className="space-y-6">
          {templatesLoading ? (
            <div className="bg-white rounded-[2.5rem] p-12 text-center space-y-4 shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-slate-100">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto animate-pulse">
                <FileText size={20} className="text-slate-300" />
              </div>
              <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">Loading checklist...</p>
            </div>
          ) : (
            documentTemplates.map((template) => (
              <section key={template.id} id={`doc-template-${template.id}`} className="space-y-5 rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-[0_10px_40px_rgba(0,0,0,0.04)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <h3 className="text-lg font-black tracking-tight text-slate-900">{template.name}</h3>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60">
                           {template.fields.length > 1 ? 'Multiple Sides' : 'Single Side'}
                        </span>
                        <div className="w-1 h-1 rounded-full bg-slate-200" />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${template.is_required ? 'text-emerald-600' : 'text-slate-400 opacity-60'}`}>
                          {template.is_required ? 'Mandatory' : 'Optional'}
                        </span>
                    </div>
                  </div>
                  <div className="rounded-full bg-slate-900/5 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 border border-slate-900/5">
                    {template.account_type || 'individual'}
                  </div>
                </div>

                <div className="space-y-6">
                  {template.fields.map((field) => {
                    const document = docs[field.key];
                    const isUploading = uploading === field.key;
                    const isRequired = Boolean(field.required ?? field.isRequired);
                    const isPhotoMissing = submittedAttempted && isRequired && !document?.previewUrl && !document?.uploaded;

                    return (
                      <div key={field.key} className="space-y-3">
                        <div className="flex items-center justify-between gap-2 px-1">
                          <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 opacity-80">{field.label}</label>
                          <span className={`text-[9px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-md ${
                            isPhotoMissing
                              ? 'bg-rose-100 text-rose-700 font-bold'
                              : isRequired
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-slate-50 text-slate-400'
                          }`}>
                            {isPhotoMissing ? 'Photo Required' : isRequired ? 'Required' : 'Optional'}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-3">
                            <div
                                id={`doc-box-${field.key}`}
                                onClick={() => {
                                    if (!document?.previewUrl && !isUploading) {
                                        fileInputRefs.current[`gallery-${field.key}`]?.click();
                                    }
                                }}
                                className={`relative min-h-[160px] rounded-[1.8rem] border-2 transition-all overflow-hidden flex flex-col items-center justify-center gap-2 ${
                                    isPhotoMissing
                                        ? 'border-rose-500 bg-rose-50/60 shadow-[0_0_20px_rgba(244,63,94,0.2)] animate-pulse'
                                        : document?.previewUrl
                                        ? 'border-emerald-500/20 bg-emerald-50/10'
                                        : 'border-dashed border-slate-100 bg-slate-50 hover:border-slate-300 hover:bg-slate-100/50 cursor-pointer'
                                }`}
                            >
                                {isUploading ? (
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Uploading</span>
                                    </div>
                                ) : document?.previewUrl ? (
                                    <>
                                        <img src={document.previewUrl} alt={field.label} className="absolute inset-0 h-full w-full object-cover" />
                                        <div className="absolute inset-0 bg-black/10" />
                                        <div className="absolute bottom-4 right-4 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-xl border-2 border-white">
                                            <CheckCircle2 size={16} strokeWidth={3} />
                                        </div>
                                        <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-md rounded-xl px-3 py-1.5 flex items-center gap-2 border border-white/20">
                                            <Camera size={12} className="text-white" />
                                            <span className="text-[10px] font-black text-white uppercase tracking-widest">Retake Photo</span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border ${
                                          isPhotoMissing
                                            ? 'bg-rose-100 text-rose-600 border-rose-200'
                                            : 'bg-white text-slate-400 border-slate-100'
                                        }`}>
                                            <UploadCloud size={20} />
                                        </div>
                                        <div className="text-center">
                                            <p className={`text-[11px] font-black uppercase tracking-widest ${isPhotoMissing ? 'text-rose-700' : 'text-slate-400'}`}>
                                              {isPhotoMissing ? 'Please upload photo' : 'Tap to upload'}
                                            </p>
                                        </div>
                                        <div className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-slate-900/5 flex items-center justify-center">
                                            <Camera size={14} className={isPhotoMissing ? 'text-rose-500' : 'text-slate-400'} />
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <label className={`flex-1 relative flex h-12 items-center justify-center gap-2 text-center rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${
                                    isUploading
                                    ? 'cursor-not-allowed border-slate-50 bg-slate-50 text-slate-300'
                                    : 'cursor-pointer border-slate-100 bg-white text-slate-600 hover:bg-slate-50 active:scale-[0.98]'
                                }`}>
                                    <ImagePlus size={16} />
                                    Gallery
                                    <input
                                    ref={(el) => (fileInputRefs.current[`gallery-${field.key}`] = el)}
                                    type="file"
                                    accept="image/*"
                                    disabled={isUploading}
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    aria-label={`Upload ${field.label} from gallery`}
                                    onChange={(event) => handleFileChange(template.id, field.key, event)}
                                    />
                                </label>
                                <button
                                    type="button"
                                    disabled={isUploading || cameraLoading}
                                    onClick={() => openCameraModal(template.id, field.key, field.label)}
                                    className={`flex-1 relative flex h-12 items-center justify-center gap-2 text-center rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${
                                        isUploading || cameraLoading
                                        ? 'cursor-not-allowed border-slate-50 bg-slate-50 text-slate-300'
                                        : 'cursor-pointer border-slate-900 bg-slate-900 text-white hover:bg-black shadow-lg shadow-slate-900/10 active:scale-[0.98]'
                                    }`}
                                >
                                    <Camera size={16} />
                                    {cameraLoading ? 'Opening...' : 'Camera'}
                                    <input
                                        ref={(el) => (fileInputRefs.current[`camera-${field.key}`] = el)}
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        disabled={isUploading}
                                        className="sr-only pointer-events-none"
                                        aria-label={`Capture ${field.label} from camera`}
                                        onClick={(event) => {
                                          event.target.value = '';
                                        }}
                                        onChange={(event) => handleFileChange(template.id, field.key, event)}
                                    />
                                </button>
                            </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {(template.has_identify_number || template.has_expiry_date) ? (
                  <div className="space-y-4 pt-2">
                    {template.has_identify_number ? (() => {
                      const metaVal = String(documentMeta[template.id]?.identifyNumber || '').trim();
                      const numberValErr = validateDocumentIdentifyNumber(template, metaVal);
                      const isNumberMissing = submittedAttempted && template.has_identify_number && template.is_required && !metaVal;
                      const hasNumberErr = isNumberMissing || Boolean(numberValErr);
                      const numberErrMsg = isNumberMissing
                        ? `Please enter ${formatMetaLabel(template.identify_number_key) || `${template.name} Number`}`
                        : numberValErr;

                      return (
                        <div className={`group rounded-[1.8rem] border-2 transition-all p-4 ${
                          hasNumberErr
                            ? 'border-rose-500 bg-rose-50/60 shadow-[0_0_20px_rgba(244,63,94,0.2)]'
                            : 'border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-slate-900/5'
                        }`}>
                          <div className="flex items-center gap-4">
                              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all ${
                                hasNumberErr
                                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                                  : 'bg-white text-slate-400 shadow-sm group-focus-within:bg-slate-900 group-focus-within:text-white'
                              }`}>
                                  <FileText size={20} strokeWidth={2.5} />
                              </div>
                              <div className="min-w-0 flex-1 space-y-0.5">
                                  <label className={`block text-[10px] font-black uppercase tracking-[0.15em] ${
                                    hasNumberErr ? 'text-rose-600' : 'text-slate-400 opacity-70'
                                  }`}>
                                      {formatMetaLabel(template.identify_number_key) || `${template.name} Number`}
                                  </label>
                                  <input
                                      ref={(el) => (fileInputRefs.current[`input-${template.id}`] = el)}
                                      type="text"
                                      value={documentMeta[template.id]?.identifyNumber || ''}
                                      onChange={(event) => handleMetaChange(template.id, 'identifyNumber', event.target.value)}
                                      placeholder={`Enter ${formatMetaLabel(template.identify_number_key) || 'Number'}`}
                                      className="w-full border-none bg-transparent p-0 text-lg font-black text-slate-900 outline-none focus:ring-0 placeholder:text-slate-200 uppercase"
                                  />
                              </div>
                          </div>
                          {hasNumberErr && (
                              <p className="text-[11px] font-bold text-rose-600 mt-2 ml-1 flex items-center gap-1.5">
                                  <AlertCircle size={14} className="shrink-0 text-rose-600" /> {numberErrMsg}
                              </p>
                          )}
                        </div>
                      );
                    })() : null}

                    {template.has_expiry_date ? (() => {
                      const expiryVal = String(documentMeta[template.id]?.expiryDate || '').trim();
                      const isExpiryMissing = submittedAttempted && template.has_expiry_date && template.is_required && !expiryVal;

                      return (
                        <div className={`group rounded-[1.8rem] border-2 transition-all p-4 ${
                          isExpiryMissing
                            ? 'border-rose-500 bg-rose-50/60 shadow-[0_0_20px_rgba(244,63,94,0.2)]'
                            : 'border-slate-50 bg-slate-50 focus-within:border-slate-900/10 focus-within:bg-white focus-within:shadow-xl focus-within:shadow-slate-900/5'
                        }`}>
                          <div className="flex items-center gap-4">
                              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all ${
                                isExpiryMissing
                                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                                  : 'bg-white text-slate-400 shadow-sm group-focus-within:bg-slate-900 group-focus-within:text-white'
                              }`}>
                                  <AlertCircle size={20} strokeWidth={2.5} />
                              </div>
                              <div className="min-w-0 flex-1 space-y-0.5">
                                  <label className={`block text-[10px] font-black uppercase tracking-[0.15em] ${
                                    isExpiryMissing ? 'text-rose-600' : 'text-slate-400 opacity-70'
                                  }`}>
                                      Expiry Date
                                  </label>
                                  <input
                                      ref={(el) => (fileInputRefs.current[`expiry-${template.id}`] = el)}
                                      type="date"
                                      value={documentMeta[template.id]?.expiryDate || ''}
                                      onChange={(event) => handleMetaChange(template.id, 'expiryDate', event.target.value)}
                                      className="w-full border-none bg-transparent p-0 text-lg font-black text-slate-900 outline-none focus:ring-0"
                                  />
                              </div>
                          </div>
                          {isExpiryMissing && (
                              <p className="text-[11px] font-bold text-rose-600 mt-2 ml-1 flex items-center gap-1.5">
                                  <AlertCircle size={14} className="shrink-0 text-rose-600" /> Expiry date is required
                              </p>
                          )}
                        </div>
                      );
                    })() : null}
                  </div>
                ) : null}
              </section>
            ))
          )}
        </div>

        <div className="bg-white/40 backdrop-blur-sm p-5 rounded-[2rem] flex gap-4 mt-6 border border-white/50 shadow-sm">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <AlertCircle size={20} className="text-amber-600" />
          </div>
          <p className="text-[12px] font-black text-amber-900/60 leading-relaxed uppercase tracking-tight">
            Choose Gallery or Camera for each document. Ensure all photos are well-lit and all text is clearly readable to avoid rejection.
          </p>
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
            <div className="mx-auto max-w-sm">
                <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSubmit}
                    disabled={loading}
                    className="group flex h-16 w-full items-center justify-center gap-3 rounded-[1.8rem] text-[15px] font-black tracking-tight transition-all relative overflow-hidden bg-slate-900 text-white shadow-[0_20px_40px_rgba(0,0,0,0.2)] active:bg-black"
                >
                    {loading ? (
                        <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <>
                            <span className="relative z-10 uppercase tracking-widest">Review & Submit</span>
                            <ChevronRight size={18} strokeWidth={3} className="relative z-10 group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </motion.button>
            </div>
        </div>

        <AnimatePresence>
          {activeCameraTarget && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 backdrop-blur-md font-['Plus_Jakarta_Sans']"
            >
              <div className="flex items-center justify-between px-6 pt-8 pb-4 border-b border-white/10">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">
                    Document Scanner
                  </span>
                  <h3 className="text-lg font-black text-white">{activeCameraTarget.label}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    stopCameraStream();
                    setActiveCameraTarget(null);
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-all active:scale-95"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="relative flex-1 flex flex-col items-center justify-center px-4 py-6">
                <div className="relative w-full max-w-sm aspect-[4/3] rounded-3xl overflow-hidden border-2 border-white/20 shadow-2xl bg-black">
                  <video
                    ref={(el) => {
                      videoRef.current = el;
                      if (el && streamRef.current) {
                        el.srcObject = streamRef.current;
                        el.play().catch(() => {});
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-4 rounded-2xl border-2 border-dashed border-emerald-400/80 pointer-events-none flex items-center justify-center">
                    <span className="text-[11px] font-black uppercase tracking-widest text-white bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/20">
                      Align document inside box
                    </span>
                  </div>
                </div>
                <p className="mt-4 text-[12px] font-bold text-slate-400 text-center max-w-xs">
                  Ensure good lighting and that all text on the document is clear and readable.
                </p>
              </div>

              <div className="flex items-center justify-around px-8 pb-10 pt-4 bg-black/40 border-t border-white/10">
                <button
                  type="button"
                  onClick={toggleCameraFacingMode}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all"
                  title="Switch Camera"
                >
                  <RefreshCw size={20} />
                </button>

                <button
                  type="button"
                  onClick={capturePhotoFromLiveCamera}
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-slate-900 shadow-[0_0_30px_rgba(255,255,255,0.4)] border-4 border-white/40 active:scale-90 transition-all"
                  title="Take Photo"
                >
                  <div className="h-14 w-14 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                    <Camera size={24} strokeWidth={2.5} />
                  </div>
                </button>

                <div className="w-12 h-12" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default StepDocuments;
