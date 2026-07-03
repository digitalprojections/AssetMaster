export interface SampleImage {
  id: string;
  name: string;
  url: string;
  fallbackUrl?: string;
  description: string;
}

export const SAMPLE_IMAGES: SampleImage[] = [
  {
    id: 'parrot',
    name: 'Tropical Parrot',
    url: 'https://images.unsplash.com/photo-1552084090-1c31de07d0d0?auto=format&fit=crop&w=1200&q=80',
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Red-and-green_macaw_in_flight.jpg/1024px-Red-and-green_macaw_in_flight.jpg',
    description: 'Perfect for magnetic lasso with rich feather boundaries.'
  },
  {
    id: 'camera',
    name: 'Vintage Camera',
    url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80',
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Classic_cameras_collection.jpg/1024px-Classic_cameras_collection.jpg',
    description: 'Great for crisp geometric edges and rectangular selects.'
  },
  {
    id: 'donut',
    name: 'Glazed Donut',
    url: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=1200&q=80',
    fallbackUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Donut-Glazed-Isolated.jpg/800px-Donut-Glazed-Isolated.jpg',
    description: 'Excellent for circular/curved freehand and magnetic tracking.'
  }
];
