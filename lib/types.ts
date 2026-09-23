export type BBox = { x: number; y: number; w: number; h: number };

export type TextBlock = {
  id: string;
  text: string;
  bbox: BBox;          // pixel coords in original image space
  confidence: number;
  fontSize: number;    // estimated px
  color: string;       // dominant text color, hex
  bgColor: string;     // dominant background color, hex
  angle: number;       // baseline rotation in radians
};

export type Edit = {
  blockId: string;
  newText: string;
};
