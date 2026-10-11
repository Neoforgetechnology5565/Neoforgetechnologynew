import { renderCard } from "./opengraph-image";

export const alt = "Neo Forge Technology — Software, AI, Automation & CAD/BIM Engineering";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

export default async function Image() {
  return renderCard();
}
