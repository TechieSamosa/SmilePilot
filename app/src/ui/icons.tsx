import type { SVGProps } from "react";
import { IS_ORTHO_PRESET } from "../preset";

type P = SVGProps<SVGSVGElement>;
const S = (props: Omit<P, "d"> & { d: string | string[] }) => {
  const { d, ...rest } = props;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {(Array.isArray(d) ? d : [d]).map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
};

export const IconTooth = (p: P) => (
  <S {...p} d="M7 3c-2.5 0-4 2-4 4.5 0 2 1 3.5 1.6 5.4.5 1.7.6 3.6 1.2 5.6.4 1.4 1 2.5 1.9 2.5 1.6 0 1.5-2.6 2.1-4.6.3-1.1.8-1.9 2.2-1.9s1.9.8 2.2 1.9c.6 2 .5 4.6 2.1 4.6.9 0 1.5-1.1 1.9-2.5.6-2 .7-3.9 1.2-5.6.6-1.9 1.6-3.4 1.6-5.4C21 5 19.5 3 17 3c-2 0-3 1-5 1S9 3 7 3Z" />
);
export const IconHome = (p: P) => <S {...p} d={["M3 10.5 12 3l9 7.5", "M5 9.5V21h14V9.5", "M9.5 21v-6h5v6"]} />;
export const IconUsers = (p: P) => (
  <S {...p} d={["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"]} />
);
export const IconChat = (p: P) => <S {...p} d={["M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z", "M8 11h.01M12 11h.01M16 11h.01"]} />;
export const IconCalendar = (p: P) => <S {...p} d={["M8 2v4M16 2v4", "M3 9h18", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"]} />;
export const IconMenu = (p: P) => <S {...p} d={["M4 6h16", "M4 12h16", "M4 18h16"]} />;
export const IconPlus = (p: P) => <S {...p} d={["M12 5v14", "M5 12h14"]} />;
export const IconBack = (p: P) => <S {...p} d="M15 18l-6-6 6-6" />;
export const IconChevron = (p: P) => <S {...p} d="M9 18l6-6-6-6" />;
export const IconSearch = (p: P) => <S {...p} d={["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "M21 21l-4.3-4.3"]} />;
export const IconPhone = (p: P) => (
  <S {...p} d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
);
export const IconWhatsApp = (p: P) => (
  <S {...p} d={["M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3Z", "M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2Z"]} />
);
export const IconCamera = (p: P) => (
  <S {...p} d={["M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z", "M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"]} />
);
export const IconImage = (p: P) => <S {...p} d={["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z", "M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z", "M21 15l-5-5L5 21"]} />;
export const IconSparkle = (p: P) => <S {...p} d={["M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z", "M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"]} />;
export const IconCheck = (p: P) => <S {...p} d="M20 6 9 17l-5-5" />;
export const IconX = (p: P) => <S {...p} d={["M18 6 6 18", "M6 6l12 12"]} />;
export const IconEdit = (p: P) => <S {...p} d={["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"]} />;
export const IconTrash = (p: P) => <S {...p} d={["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6"]} />;
export const IconShare = (p: P) => <S {...p} d={["M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8", "M16 6l-4-4-4 4", "M12 2v13"]} />;
export const IconFile = (p: P) => <S {...p} d={["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z", "M14 2v6h6", "M8 13h8M8 17h5"]} />;
export const IconPill = (p: P) => <S {...p} d={["M10.5 20.5a5 5 0 0 1-7-7l10-10a5 5 0 0 1 7 7Z", "M8.5 8.5l7 7"]} />;
export const IconSettings = (p: P) => (
  <S {...p} d={["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"]} />
);
export const IconChart = (p: P) => <S {...p} d={["M3 3v18h18", "M7 15l4-4 3 3 5-6"]} />;
export const IconThumbUp = (p: P) => <S {...p} d={["M7 10v12", "M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.5l-2.3 8A2 2 0 0 1 17.4 22H7V10l4.3-7.4A1.8 1.8 0 0 1 15 4Z"]} />;
export const IconThumbDown = (p: P) => <S {...p} d={["M17 14V2", "M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.5l2.3-8A2 2 0 0 1 6.6 2H17v12l-4.3 7.4A1.8 1.8 0 0 1 9 20Z"]} />;
export const IconCopy = (p: P) => <S {...p} d={["M9 9h11v11H9Z", "M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"]} />;
export const IconSend = (p: P) => <S {...p} d={["M22 2 11 13", "M22 2l-7 20-4-9-9-4Z"]} />;
export const IconZoomIn = (p: P) => <S {...p} d={["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "M21 21l-4.3-4.3", "M11 8v6M8 11h6"]} />;
export const IconBox = (p: P) => <S {...p} d={["M4 4h4M4 4v4M20 4h-4M20 4v4M4 20h4M4 20v-4M20 20h-4M20 20v-4"]} />;
export const IconEye = (p: P) => <S {...p} d={["M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"]} />;
export const IconRotate = (p: P) => <S {...p} d={["M21 12a9 9 0 1 1-3-6.7L21 8", "M21 3v5h-5"]} />;
export const IconContrast = (p: P) => <S {...p} d={["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 3v18"]} />;
export const IconLock = (p: P) => <S {...p} d={["M5 11h14v10H5Z", "M8 11V7a4 4 0 0 1 8 0v4"]} />;
export const IconDownload = (p: P) => <S {...p} d={["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"]} />;
export const IconUpload = (p: P) => <S {...p} d={["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12"]} />;
export const IconAlert = (p: P) => <S {...p} d={["M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z", "M12 9v4M12 17h.01"]} />;
export const IconWallet = (p: P) => <S {...p} d={["M3 7h18v13H3Z", "M3 7l3-4h12l3 4", "M16 13.5h.01"]} />;
export const IconBrain = (p: P) => (
  <S {...p} d={["M9.5 2A2.5 2.5 0 0 0 7 4.5v.5a3 3 0 0 0-3 3 3 3 0 0 0 .6 1.8A3 3 0 0 0 3 12.5a3 3 0 0 0 2 2.8V16a3 3 0 0 0 3 3h1.5V2Z", "M14.5 2A2.5 2.5 0 0 1 17 4.5v.5a3 3 0 0 1 3 3 3 3 0 0 1-.6 1.8 3 3 0 0 1 1.6 2.7 3 3 0 0 1-2 2.8V16a3 3 0 0 1-3 3h-1.5V2Z"]} />
);

/** Brand logo: the same filled molar + sparkle used for the app icon. */
export const ToothLogo = (p: P) => (
  <svg viewBox="0 0 100 100" aria-hidden {...p}>
    <path
      fill="currentColor"
      d="M50 24 C43 18.5 31 15.5 24.5 21.5 C17.5 28 18.5 40.5 22 50 C25 58 26.8 66 27.8 75 C28.8 84 31.5 90.5 36 90.5 C41 90.5 42.2 82.5 43.2 74.5 C44.1 67.6 46.2 63 50 63 C53.8 63 55.9 67.6 56.8 74.5 C57.8 82.5 59 90.5 64 90.5 C68.5 90.5 71.2 84 72.2 75 C73.2 66 75 58 78 50 C81.5 40.5 82.5 28 75.5 21.5 C69 15.5 57 18.5 50 24 Z"
    />
    {IS_ORTHO_PRESET && (
      <>
        <line x1="6" y1="45" x2="94" y2="45" stroke="#f4c542" strokeWidth="3.2" strokeLinecap="round" />
        <rect x="40.5" y="37" width="19" height="16" rx="3.2" fill="var(--brand-2, #5a409b)" />
        <rect x="43.5" y="43.4" width="13" height="3.2" rx="1.2" fill="#f4c542" />
      </>
    )}
    <path fill="currentColor" opacity="0.85" d="M83 6 C84.4 13.6 84.4 13.6 92 15 C84.4 16.4 84.4 16.4 83 24 C81.6 16.4 81.6 16.4 74 15 C81.6 13.6 81.6 13.6 83 6 Z" />
  </svg>
);
