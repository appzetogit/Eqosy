import { env } from '../../../config/env.js';
import { ApiError } from '../../../utils/ApiError.js';
import { AdminBusinessSetting } from '../admin/models/AdminBusinessSetting.js';

const SMS_INDIA_HUB_ENDPOINT = 'http://cloud.smsindiahub.in/api/mt/SendSMS';
const DLT_TEMPLATE_TEXT =
  process.env.SMS_DLT_TEMPLATE_TEXT ||
  'Welcome to Eqosy. Your OTP for registration is ##var##.BGADEC';
const DEFAULT_BRAND_NAME = 'Eqosy';

const isTruthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());

const readValue = (...values) => {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (trimmedValue) {
        return trimmedValue;
      }
    }
  }

  return '';
};

const normalizeIndianPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '').trim();

  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }

  if (digits.length === 10) {
    return `91${digits}`;
  }

  return digits;
};

const maskSecret = (value) => {
  const stringValue = String(value || '');

  if (!stringValue) {
    return '';
  }

  if (stringValue.length <= 6) {
    return `${'*'.repeat(Math.max(stringValue.length - 2, 0))}${stringValue.slice(-2)}`;
  }

  return `${stringValue.slice(0, 3)}${'*'.repeat(stringValue.length - 6)}${stringValue.slice(-3)}`;
};

const getSmsIndiaHubConfig = () => {
  const user = readValue(env.sms?.indiaHub?.username, process.env.SMS_INDIA_HUB_USERNAME);
  const password = readValue(env.sms?.indiaHub?.password, process.env.SMS_INDIA_HUB_PASSWORD);
  const apiKey = readValue(
    env.sms?.indiaHub?.apiKeyOverride,
    env.sms?.indiaHub?.apiKey,
    process.env.SMS_INDIA_HUB_API_KEY_OVERRIDE,
    process.env.SMS_INDIA_HUB_API_KEY,
  );
  const senderId = readValue(env.sms?.indiaHub?.senderId, process.env.SMS_INDIA_HUB_SENDER_ID, 'BGADEC');
  const peId = readValue(env.sms?.indiaHub?.peId, process.env.SMS_INDIA_HUB_PE_ID, '1001164203633432409');
  const templateId = readValue(
    env.sms?.indiaHub?.dltTemplateId,
    process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID,
    '1007282516644508833',
  );

  return {
    user,
    password,
    apiKey,
    senderId,
    peId,
    templateId,
  };
};

const logSmsConfigDebug = (config) => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  console.log('[smsService] resolved SMS auth config =', {
    user: config.user || '',
    passwordPresent: Boolean(config.password),
    passwordMasked: maskSecret(config.password),
    apiKeyPresent: Boolean(config.apiKey),
    apiKeyMasked: maskSecret(config.apiKey),
    senderId: config.senderId || '',
    templateId: config.templateId || '',
  });
};

const logSmsPayloadDebug = (payload) => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const debugPayload = {};
  for (const [key, value] of payload.entries()) {
    debugPayload[key] = ['password'].includes(key) ? maskSecret(value) : value;
  }

  console.log('[smsService] final payload before request =', debugPayload);
};

const parseProviderResponse = (responseText) => {
  try {
    return JSON.parse(responseText);
  } catch {
    return null;
  }
};

const getConfiguredBrandName = async () => {
  return DEFAULT_BRAND_NAME;
};

const renderOtpMessage = ({ otp }) => {
  return `Welcome to Eqosy. Your OTP for registration is ${otp}.BGADEC`;
};

const isSuccessfulProviderResponse = (response, responseText) => {
  const parsed = parseProviderResponse(responseText);

  if (parsed && typeof parsed === 'object') {
    return response.ok && String(parsed.ErrorCode || '') === '000';
  }

  return response.ok && !/error|invalid|failed|unauthor|reject|blank/i.test(responseText);
};

const isAuthParsingError = (response, responseText) => {
  const parsed = parseProviderResponse(responseText);
  const errorMessage = String(parsed?.ErrorMessage || responseText || '').toLowerCase();
  const errorCode = String(parsed?.ErrorCode || '');

  return !response.ok || errorCode === '1' || errorCode === '2' || errorMessage.includes('login details cannot be blank');
};

const buildSmsPayload = ({ phone, otp, appName, authMode = 'apiKey' }) => {
  const config = getSmsIndiaHubConfig();

  logSmsConfigDebug(config);

  const useApiKey = authMode === 'apiKey';
  if (useApiKey) {
    if (!config.apiKey) {
      throw new ApiError(500, 'SMS India Hub API key is not configured');
    }
  } else {
    if (!config.user) {
      throw new ApiError(500, 'SMS India Hub user is not configured');
    }

    if (!config.password) {
      throw new ApiError(500, 'SMS India Hub password is not configured');
    }
  }

  if (!config.senderId) {
    throw new ApiError(500, 'SMS sender ID is not configured');
  }

  const normalizedPhone = normalizeIndianPhone(phone);
  if (!/^91\d{10}$/.test(normalizedPhone)) {
    throw new ApiError(400, 'A valid Indian mobile number is required for OTP');
  }

  const payload = new URLSearchParams({
    senderid: config.senderId,
    channel: 'Trans',
    DCS: '0',
    flashsms: '0',
    number: normalizedPhone,
    text: renderOtpMessage({ appName, otp }),
    TemplateId: config.templateId,
    PEID: config.peId || '1001164203633432409',
  });

  if (useApiKey) {
    payload.set('APIKey', config.apiKey);
  } else {
    payload.set('user', config.user);
    payload.set('password', config.password);
  }

  logSmsPayloadDebug(payload);

  return payload;
};

export const sendOtpSms = async ({ phone, otp, purpose = 'otp' }) => {
  if (isTruthy(env.sms.useDefaultOtp)) {
    return {
      mode: 'debug',
      message: 'Default OTP mode enabled',
    };
  }

  const digits = String(phone || '').replace(/\D/g, '');
  const msisdn = digits.startsWith('91') ? digits : `91${digits}`;
  const apiKey = (env.sms?.indiaHub?.apiKey || process.env.SMS_INDIA_HUB_API_KEY || 'a1c4cde49bf4444fa858a7c631c7eaa6').trim();
  const senderId = (env.sms?.indiaHub?.senderId || process.env.SMS_INDIA_HUB_SENDER_ID || 'BGADEC').trim();
  const peId = (env.sms?.indiaHub?.peId || process.env.SMS_INDIA_HUB_PE_ID || '1001164203633432409').trim();
  const templateId = (env.sms?.indiaHub?.dltTemplateId || process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID || '1007282516644508833').trim();
  const message = `Welcome to the Eqosy powered by Appzeto.Your OTP for registration is ${otp}.BGADEC`;

  console.log(`[SMS] Dispatching live SMS OTP ${otp} to ${msisdn} via SMS India Hub...`);

  // Primary: GET request on /api/mt/SendSMS (exact method as user sign in)
  const sendUrl = new URL('http://cloud.smsindiahub.in/api/mt/SendSMS');
  sendUrl.searchParams.append('APIKey', apiKey);
  sendUrl.searchParams.append('senderid', senderId);
  sendUrl.searchParams.append('channel', 'Trans');
  sendUrl.searchParams.append('DCS', '0');
  sendUrl.searchParams.append('flashsms', '0');
  sendUrl.searchParams.append('number', msisdn);
  sendUrl.searchParams.append('text', message);
  sendUrl.searchParams.append('TemplateId', templateId);
  sendUrl.searchParams.append('PEID', peId);

  let finalResponseText = '';
  let delivered = false;
  let jobId = null;

  try {
    const primaryRes = await fetch(sendUrl.toString(), { signal: AbortSignal.timeout(15000) });
    finalResponseText = (await primaryRes.text()).trim();
    console.log(`[SMS] Primary SendSMS response for ${msisdn}: ${finalResponseText}`);
    const parsed = parseProviderResponse(finalResponseText);
    const isSuccess = primaryRes.ok && (
      (parsed && String(parsed.ErrorCode || '') === '000') ||
      (!parsed && !/error(?!message)|invalid|failed|unauthor|reject/i.test(finalResponseText)) ||
      finalResponseText.includes('"ErrorCode":"000"')
    );
    if (isSuccess) {
      delivered = true;
      jobId = parsed?.JobId || null;
    }
  } catch (primaryErr) {
    console.warn(`[SMS] Primary SendSMS failed: ${primaryErr.message}. Trying vendor fallback...`);
  }



  if (!delivered) {
    throw new ApiError(
      502,
      `SMS India Hub rejected ${purpose} request: ${finalResponseText}`,
    );
  }

  return {
    mode: 'live',
    message: 'OTP sent successfully',
    providerResponse: finalResponseText,
    jobId,
  };
};
