import type { ImageInput } from '../../src/judge';

export function PhotoThumb({ image, alt }: { image: ImageInput; alt: string }) {
  // The core stores base64 WITHOUT the `data:` prefix (by contract); re-add it
  // here. A plain <img> (not next/image) since these are inline data URLs, not
  // optimizable remote URLs.
  return <img className="thumb" src={`data:${image.mimeType};base64,${image.data}`} alt={alt} />;
}
