import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { CredentialCertificateStatus } from '../../types/credential.d.ts';

// 与 mitmdump 的显式 confdir 保持一致，不检查同名的旧证书。
export const CREDENTIAL_MITM_CONFDIR = join(homedir(), '.mitmproxy');
const CERTIFICATE_PATH = join(CREDENTIAL_MITM_CONFDIR, 'mitmproxy-ca-cert.pem');
const execFileAsync = promisify(execFile);

interface CertificateCheckDependencies {
  platform: string;
  checkReadable: () => Promise<void>;
  verifyTrust: () => Promise<void>;
}

const defaultDependencies: CertificateCheckDependencies = {
  platform: process.platform,
  checkReadable: () => access(CERTIFICATE_PATH, constants.R_OK),
  verifyTrust: async () => {
    // 只读验证：不执行 sudo、不导入证书、不绕过 TLS 校验，也不依赖外网 HEAD 请求。
    await execFileAsync('/usr/bin/security', ['verify-cert', '-c', CERTIFICATE_PATH, '-p', 'basic'], {
      encoding: 'utf-8',
      timeout: 5000,
      maxBuffer: 64 * 1024,
    });
  },
};

export async function checkCredentialCertificate(
  dependencies: CertificateCheckDependencies = defaultDependencies
): Promise<CredentialCertificateStatus> {
  if (dependencies.platform !== 'darwin') {
    return { state: 'unsupported', message: '证书自动检测目前仅支持 macOS，请在使用代理的设备上手动确认 CA 信任。' };
  }

  try {
    await dependencies.checkReadable();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { state: 'missing', message: '尚未生成 mitmproxy CA，请等待抓包服务启动后重新检测。' };
    }
    return {
      state: 'error',
      message: '无法读取本机 mitmproxy CA，请检查文件权限；不要修改私钥权限或复制其他电脑的 CA。',
    };
  }

  try {
    await dependencies.verifyTrust();
    return { state: 'trusted', message: '本机 mitmproxy CA 已通过系统信任验证。' };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    const output = `${failure.stdout || ''}\n${failure.stderr || ''}`;
    if (/CSSMERR_TP_NOT_TRUSTED|CSSMERR_TP_INVALID_ANCHOR_CERT|errSecNotTrusted/.test(output)) {
      return {
        state: 'untrusted',
        message: '本机尚未信任当前 mitmproxy CA，已阻止启用代理，以免 Chrome 报证书错误或微信文章反复加载。',
      };
    }
    return {
      state: 'error',
      message:
        '无法确认 mitmproxy CA 信任状态，已阻止启用代理。请手动验证证书，检查有效期、系统时间或检测命令是否超时。',
    };
  }
}

export class CredentialCertificateError extends Error {}

export function assertCredentialCertificateTrusted(certificate: CredentialCertificateStatus) {
  if (certificate.state !== 'trusted') throw new CredentialCertificateError(certificate.message);
}
