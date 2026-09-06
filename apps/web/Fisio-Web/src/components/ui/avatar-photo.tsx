import { useState } from "react";
import { cn } from "@/lib/utils";

// Avatar con foto real opcional. Si el archivo en /public/images aún no
// existe (404), cae automáticamente al círculo con iniciales -- así el
// sitio nunca se ve roto mientras se consigue la foto definitiva.
export function AvatarPhoto({
  src,
  initials,
  alt,
  className,
}: {
  src: string;
  initials: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-sky-100",
          className
        )}
      >
        <span className="font-display text-5xl text-deep-600">{initials}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className={cn("rounded-full object-cover bg-sky-100", className)}
    />
  );
}
