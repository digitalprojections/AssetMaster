export type EmptyWorkspaceCopy = {
  title: string;
  description: string;
  actionLabel: string;
  hint: string;
};

export function getEmptyWorkspaceCopy(): EmptyWorkspaceCopy {
  return {
    title: 'Open an image to begin',
    description: 'Upload an image to start cutting out assets in the editor.',
    actionLabel: 'Upload image',
    hint: 'You can also drag and drop an image onto the canvas.',
  };
}
