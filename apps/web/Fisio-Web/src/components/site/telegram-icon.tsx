// Ícono de marca de Telegram (avión de papel), a color plano en vez del
// estilo trazo de lucide-react -- así se reconoce como el logo real y no
// como un ícono genérico de "enviar". Usa currentColor para heredar el
// color del texto del botón donde se use.
export function TelegramIcon({
  className,
  size = 16,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M21.05 3.29a1.2 1.2 0 0 0-1.24-.2L2.72 9.53a1.15 1.15 0 0 0 .07 2.17l4.47 1.42 1.72 5.52a1.15 1.15 0 0 0 1.95.45l2.57-2.57 4.4 3.24a1.16 1.16 0 0 0 1.83-.7l3.06-14.4a1.2 1.2 0 0 0-.74-1.37Zm-3.02 3.06-7.44 6.73-.34 3.36-1.4-4.5 11.06-6.9c.32-.2.6.19.32.42Z" />
    </svg>
  );
}
