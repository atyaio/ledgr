import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { brandTokens, type Branding, type BrandingResponse } from '@atyaio/ledgr-shared';
import { api } from './api';
import { useI18n } from '@/i18n';

export interface BrandingState extends Branding {
  /** Localised project name. */
  projectName: string;
  /** What to call the app: the project name when white-labelled, otherwise "ledgr". */
  appName: string;
  loaded: boolean;
}

const DEFAULT: BrandingState = { projectName: '', appName: 'ledgr', loaded: false };
const Ctx = createContext<BrandingState>(DEFAULT);
const BRAND_KEYS = Object.keys(brandTokens('#000000'));

/** Public endpoint: works before sign-in so the login screen is branded too. */
export function useBrandingQuery() {
  return useQuery({ queryKey: ['branding'], queryFn: () => api.get<BrandingResponse>('/project/branding'), staleTime: 60_000, retry: 0 });
}

/** Applies the brand colour to the document and exposes logo / name to the UI. Never blocks rendering. */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const q = useBrandingQuery();
  const { name } = useI18n();
  const value = useMemo<BrandingState>(() => {
    if (!q.data) return DEFAULT;
    const projectName = name({ name: q.data.name, nameAr: q.data.nameAr });
    const b = q.data.branding ?? {};
    return { ...b, projectName, appName: b.showProjectName && projectName ? projectName : 'ledgr', loaded: true };
  }, [q.data, name]);

  useEffect(() => {
    const root = document.documentElement;
    if (value.primaryColor) {
      for (const [k, v] of Object.entries(brandTokens(value.primaryColor))) root.style.setProperty(k, v);
      root.setAttribute('data-branded', '');
    } else {
      for (const k of BRAND_KEYS) root.style.removeProperty(k);
      root.removeAttribute('data-branded');
    }
  }, [value.primaryColor]);

  useEffect(() => {
    document.title = value.appName;
  }, [value.appName]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBranding(): BrandingState {
  return useContext(Ctx);
}

const MAX_LOGO_BYTES = 300 * 1024;
const RASTER_SIZE = 256;

/**
 * Turn an uploaded image into a small data URL for config.json.
 * SVGs are kept as-is (size-checked); raster images are scaled to fit 256×256 and re-encoded as PNG.
 */
export async function fileToLogoDataUrl(file: File): Promise<string> {
  if (file.type === 'image/svg+xml') {
    if (file.size > MAX_LOGO_BYTES) throw new Error('SVG is too large (max 300 KB)');
    const text = await file.text();
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
  }
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Use a PNG, JPEG, WebP, GIF or SVG image');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read the image'));
      el.src = url;
    });
    const scale = Math.min(1, RASTER_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL('image/png');
    if (out.length > MAX_LOGO_BYTES * 1.4) throw new Error('Image is too large even after resizing; try a simpler logo');
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
