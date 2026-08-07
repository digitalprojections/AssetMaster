import type { CollageTextBubbleStyle } from '../types';

export const DEFAULT_TEXT_BUBBLE_FILL_COLOR = '#ffffff';
export const DEFAULT_TEXT_BUBBLE_STROKE_COLOR = '#0f172a';
export const DEFAULT_TEXT_BUBBLE_STROKE_WIDTH = 6;
export const DEFAULT_TEXT_BUBBLE_PADDING = 30;

const MIN_TEXT_BUBBLE_PADDING = 8;
const MAX_TEXT_BUBBLE_PADDING = 120;

export type TextBubbleLayoutInput = {
  contentWidth: number;
  contentHeight: number;
  style?: CollageTextBubbleStyle;
  padding?: number;
};

export type TextBubbleLayout = {
  style: CollageTextBubbleStyle;
  width: number;
  height: number;
  contentLeft: number;
  contentTop: number;
  contentWidth: number;
  contentHeight: number;
  bubbleLeft: number;
  bubbleTop: number;
  bubbleWidth: number;
  bubbleHeight: number;
  padding: number;
  tailHeight: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const normalizeTextBubbleStyle = (style: CollageTextBubbleStyle | undefined): CollageTextBubbleStyle =>
  style === 'speech' || style === 'thought' ? style : 'none';

export const normalizeTextBubblePadding = (padding: number | undefined) =>
  clamp(Math.round(Number.isFinite(padding) ? padding ?? DEFAULT_TEXT_BUBBLE_PADDING : DEFAULT_TEXT_BUBBLE_PADDING), MIN_TEXT_BUBBLE_PADDING, MAX_TEXT_BUBBLE_PADDING);

export const getTextBubbleLayout = ({
  contentWidth,
  contentHeight,
  style,
  padding,
}: TextBubbleLayoutInput): TextBubbleLayout => {
  const normalizedStyle = normalizeTextBubbleStyle(style);
  const normalizedContentWidth = Math.max(1, Math.ceil(contentWidth));
  const normalizedContentHeight = Math.max(1, Math.ceil(contentHeight));

  if (normalizedStyle === 'none') {
    return {
      style: 'none',
      width: normalizedContentWidth,
      height: normalizedContentHeight,
      contentLeft: -normalizedContentWidth / 2,
      contentTop: -normalizedContentHeight / 2,
      contentWidth: normalizedContentWidth,
      contentHeight: normalizedContentHeight,
      bubbleLeft: -normalizedContentWidth / 2,
      bubbleTop: -normalizedContentHeight / 2,
      bubbleWidth: normalizedContentWidth,
      bubbleHeight: normalizedContentHeight,
      padding: 0,
      tailHeight: 0,
    };
  }

  const normalizedPadding = normalizeTextBubblePadding(padding);
  const tailHeight = normalizedStyle === 'speech'
    ? Math.max(24, Math.round(normalizedPadding * 0.9))
    : Math.max(18, Math.round(normalizedPadding * 0.65));
  const width = Math.ceil(normalizedContentWidth + normalizedPadding * 2);
  const bubbleHeight = Math.ceil(normalizedContentHeight + normalizedPadding * 2);
  const height = bubbleHeight + tailHeight;

  return {
    style: normalizedStyle,
    width,
    height,
    contentLeft: -width / 2 + normalizedPadding,
    contentTop: -height / 2 + normalizedPadding,
    contentWidth: normalizedContentWidth,
    contentHeight: normalizedContentHeight,
    bubbleLeft: -width / 2,
    bubbleTop: -height / 2,
    bubbleWidth: width,
    bubbleHeight,
    padding: normalizedPadding,
    tailHeight,
  };
};
