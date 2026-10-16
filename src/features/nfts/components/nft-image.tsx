import { useState } from 'react';

interface NftImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  width: number;
  height: number;
}

/** Imagem com proporção reservada (sem salto de layout) e substituto textual se o arquivo falhar. */
export function NftImage({ src, alt, className = '', priority = false, width, height }: NftImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) {
    return (
      <div role="img" aria-label={alt} className={`flex items-center justify-center overflow-hidden bg-surface p-1 text-center text-xs text-muted sm:text-sm ${className}`}>
        Imagem indisponível
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
}
