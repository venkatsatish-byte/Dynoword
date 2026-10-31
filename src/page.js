// Page geometry in inches.
export const PAGE_SIZES = {
  letter: { w: 8.5, h: 11, label: 'Letter', css: 'letter' },
  legal: { w: 8.5, h: 14, label: 'Legal', css: 'legal' },
  a4: { w: 8.27, h: 11.69, label: 'A4', css: 'A4' },
  a5: { w: 5.83, h: 8.27, label: 'A5', css: 'A5' },
};

export const MARGINS = {
  normal: { top: 1, bottom: 1, left: 1, right: 1 },
  narrow: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
  moderate: { top: 1, bottom: 1, left: 0.75, right: 0.75 },
  wide: { top: 1, bottom: 1, left: 2, right: 2 },
};

export const DEFAULT_SETTINGS = {
  pageSize: 'letter',
  orientation: 'portrait',
  margins: 'normal',
  columns: 1,
  header: '',
  footer: '',
  pageNumbers: false,
};
