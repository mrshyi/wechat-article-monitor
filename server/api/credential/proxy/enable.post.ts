import { CredentialCertificateError } from '~/server/utils/credential-certificate';
import { assertSystemProxyRequest, enableSystemProxy, getSystemProxyStatus } from '~/server/utils/system-proxy-manager';

export default defineEventHandler(async event => {
  assertSystemProxyRequest(event);
  try {
    await enableSystemProxy({ rememberConsent: true });
  } catch (error) {
    if (error instanceof CredentialCertificateError) {
      throw createError({ statusCode: 409, message: error.message, data: { message: error.message } });
    }
    throw error;
  }
  return getSystemProxyStatus();
});
