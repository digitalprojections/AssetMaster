type ClipboardFileItem = {
  kind?: string;
  type?: string;
  getAsFile?: () => File | null;
};

type ClipboardDataWithFiles = {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<ClipboardFileItem> | null;
};

const isImageMimeType = (type: string | undefined) => type?.toLowerCase().startsWith('image/') ?? false;

const getFileKey = (file: File) => `${file.name}:${file.type}:${file.size}:${file.lastModified}`;

export const isImageFile = (file: File | null | undefined) => Boolean(file && isImageMimeType(file.type));

export const getClipboardImageFiles = (clipboardData: ClipboardDataWithFiles | null | undefined): File[] => {
  if (!clipboardData) {
    return [];
  }

  const files: File[] = [];
  const seen = new Set<string>();

  const addFile = (file: File | null | undefined) => {
    if (!isImageFile(file)) {
      return;
    }

    const key = getFileKey(file);
    if (seen.has(key)) {
      return;
    }

    files.push(file);
    seen.add(key);
  };

  for (const item of Array.from(clipboardData.items ?? [])) {
    if (item.kind && item.kind !== 'file') {
      continue;
    }

    if (!isImageMimeType(item.type)) {
      continue;
    }

    addFile(item.getAsFile?.() ?? null);
  }

  for (const file of Array.from(clipboardData.files ?? [])) {
    addFile(file);
  }

  return files;
};
