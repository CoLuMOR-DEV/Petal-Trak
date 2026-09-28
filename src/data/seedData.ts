import { doc, getDoc, setDoc, writeBatch, collection, getDocs } from 'firebase/firestore';
import { Firestore } from 'firebase/firestore';
import { ProductItem, InventoryItem, StudioSettings } from '../types';

export const INITIAL_PRODUCTS: ProductItem[] = [
  {
    id: 'rose',
    name: 'Satin Ribbon Rose',
    flowerType: 'rose',
    basePrice: 80,
    description: 'Hand-folded single stem rose made from soft, shiny satin ribbon. Finished with delicate green leaves, florist stem wire, and clean paper wrapping.',
    badge: '1 pc stem',
    imageUrl: '/Rose.jpg',
    availableColors: [
      'Pastel Pink',
      'Pink',
      'Violet',
      'White',
      'Yellow',
      'Sage Green',
      'Emerald',
      'Brown'
    ],
    active: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'dahlia',
    name: 'Satin Ribbon Dahlia',
    flowerType: 'dahlia',
    basePrice: 70,
    description: 'A full, dimensional dahlia bloom made with over 30 individual satin petals folded by hand. Keeps its vibrant color and shape forever without wilting.',
    badge: '1 pc stem',
    imageUrl: '/Dahlia.jpg',
    availableColors: [
      'Pastel Pink',
      'Pink',
      'Violet',
      'White',
      'Yellow',
      'Sage Green',
      'Emerald',
      'Brown'
    ],
    active: true,
    updatedAt: new Date().toISOString(),
  }
];

export const INITIAL_INVENTORY: InventoryItem[] = [
  // Flower Heads
  { id: 'flower_rose', name: 'Rose Flower Heads', category: 'flower', stock: 45, unit: 'pcs', lowStockThreshold: 10, colorHex: '#F4A6B0' },
  { id: 'flower_dahlia', name: 'Dahlia Flower Heads', category: 'flower', stock: 38, unit: 'pcs', lowStockThreshold: 10, colorHex: '#E27396' },
  
  // Colors (Satin Ribbon rolls)
  { id: 'color_pastel_pink', name: 'Satin Ribbon - Pastel Pink', category: 'color', stock: 30, unit: 'rolls', lowStockThreshold: 5, colorHex: '#FAD2E1' },
  { id: 'color_pink', name: 'Satin Ribbon - Classic Pink', category: 'color', stock: 25, unit: 'rolls', lowStockThreshold: 5, colorHex: '#F4A6B0' },
  { id: 'color_violet', name: 'Satin Ribbon - Violet', category: 'color', stock: 28, unit: 'rolls', lowStockThreshold: 5, colorHex: '#9B72AA' },
  { id: 'color_white', name: 'Satin Ribbon - Pure White', category: 'color', stock: 35, unit: 'rolls', lowStockThreshold: 8, colorHex: '#FFFFFF' },
  { id: 'color_yellow', name: 'Satin Ribbon - Canary Yellow', category: 'color', stock: 22, unit: 'rolls', lowStockThreshold: 5, colorHex: '#F5E58C' },
  { id: 'color_sage_green', name: 'Satin Ribbon - Sage Green', category: 'color', stock: 20, unit: 'rolls', lowStockThreshold: 5, colorHex: '#87A987' },
  { id: 'color_emerald', name: 'Satin Ribbon - Emerald', category: 'color', stock: 18, unit: 'rolls', lowStockThreshold: 4, colorHex: '#1D5E43' },
  { id: 'color_brown', name: 'Satin Ribbon - Warm Brown', category: 'color', stock: 15, unit: 'rolls', lowStockThreshold: 4, colorHex: '#8B5E3C' },

  // Wrappers
  { id: 'wrapper_rainbow', name: 'Bouquet Wrapper - Transparent Rainbow', category: 'wrapper', stock: 40, unit: 'sheets', lowStockThreshold: 8, colorHex: '#E8D5FF' },
  { id: 'wrapper_green', name: 'Bouquet Wrapper - Forest Green', category: 'wrapper', stock: 25, unit: 'sheets', lowStockThreshold: 5, colorHex: '#2D6A4F' },
  { id: 'wrapper_yellow', name: 'Bouquet Wrapper - Pastel Yellow', category: 'wrapper', stock: 30, unit: 'sheets', lowStockThreshold: 6, colorHex: '#FEFAE0' },
  { id: 'wrapper_brown', name: 'Bouquet Wrapper - Kraft Brown', category: 'wrapper', stock: 20, unit: 'sheets', lowStockThreshold: 5, colorHex: '#DDA15E' },
  { id: 'wrapper_violet', name: 'Bouquet Wrapper - Soft Violet', category: 'wrapper', stock: 25, unit: 'sheets', lowStockThreshold: 5, colorHex: '#C8B6FF' },
  { id: 'wrapper_pink', name: 'Bouquet Wrapper - Blush Pink', category: 'wrapper', stock: 35, unit: 'sheets', lowStockThreshold: 8, colorHex: '#FFC8DD' },
  { id: 'wrapper_white', name: 'Bouquet Wrapper - Frosted White', category: 'wrapper', stock: 45, unit: 'sheets', lowStockThreshold: 10, colorHex: '#F8F9FA' },

  // Ribbon (5cm ties)
  { id: 'ribbon_yellow', name: '5cm Ribbon - Yellow', category: 'ribbon', stock: 35, unit: 'meters', lowStockThreshold: 8, colorHex: '#FFD166' },
  { id: 'ribbon_green', name: '5cm Ribbon - Green', category: 'ribbon', stock: 28, unit: 'meters', lowStockThreshold: 6, colorHex: '#06D6A0' },
  { id: 'ribbon_pink', name: '5cm Ribbon - Pink', category: 'ribbon', stock: 40, unit: 'meters', lowStockThreshold: 10, colorHex: '#FF70A6' },
  { id: 'ribbon_violet', name: '5cm Ribbon - Violet', category: 'ribbon', stock: 30, unit: 'meters', lowStockThreshold: 6, colorHex: '#795290' },
  { id: 'ribbon_emerald', name: '5cm Ribbon - Emerald', category: 'ribbon', stock: 22, unit: 'meters', lowStockThreshold: 5, colorHex: '#087E5B' },
  { id: 'ribbon_brown', name: '5cm Ribbon - Brown', category: 'ribbon', stock: 18, unit: 'meters', lowStockThreshold: 5, colorHex: '#6F4E37' },

  // Craft Supplies
  { id: 'craft_tape', name: 'Floral Stem Tape', category: 'craft_supply', stock: 12, unit: 'rolls', lowStockThreshold: 3 },
  { id: 'craft_glue', name: 'Hot Melt Glue Sticks', category: 'craft_supply', stock: 85, unit: 'pcs', lowStockThreshold: 15 },
  { id: 'craft_sticks', name: 'BBQ Bamboo Stems (30cm)', category: 'craft_supply', stock: 150, unit: 'pcs', lowStockThreshold: 25 },
  { id: 'craft_lights', name: 'Fairy LED Warm Lights', category: 'craft_supply', stock: 24, unit: 'sets', lowStockThreshold: 6 },
];

export const INITIAL_STUDIO_SETTINGS: StudioSettings = {
  businessName: 'LYPetal Flower Studio',
  ownerName: 'Allyson',
  ownerTitle: 'Founder & Artisan Florist',
  headline: '"Every flower has a story, and these ones stay with you forever."',
  ownerPhotoUrl: '/Allyson.jpg',
  ownerIntro: "Hi, I'm Allyson! I make all the satin ribbon flowers here in our Laguna studio. Real flowers are lovely, but they wilt in a few days. I started making satin blooms so people could keep their graduation, birthday, or anniversary flowers on their desk for years. Every single petal is cut, heat-sealed, and folded by hand.",
  story: "What started as a hobby on my dining table turned into LYPetal after friends started asking for keepsake bouquets for their loved ones. I still assemble every order by hand, choose each ribbon roll myself, and pack everything carefully so it arrives safely at your doorstep in Laguna or Metro Manila.",
  contactPhone: '+63 912 345 6789',
  contactEmail: 'allyson@lypetal.com',
  pickupAddress: 'Block 4, Lot 12, Dahlia St., San Pedro, Laguna, Philippines',
  facebookPage: 'https://facebook.com/lypetal.studio',
  instagramHandle: '@lypetal.flowers',
  twoFactorEmails: 'colum00r@gmail.com, hanzgonzales125@gmail.com, allyson@lypetal.com',
  senderEmail: '',
  updatedAt: new Date().toISOString(),
};

const SEED_CACHE_KEY = 'lypetal_firestore_seed_checked_v2';

/**
 * Initializes Firestore default data if collections are empty.
 */
export async function seedDatabaseIfEmpty(db: Firestore, force = false) {
  if (!force && typeof window !== 'undefined') {
    try {
      if (localStorage.getItem(SEED_CACHE_KEY) === 'true') {
        return;
      }
    } catch {
      // ignore storage access issues
    }
  }

  try {
    // Check if products exist and migrate any legacy stock images to studio assets
    const prodSnap = await getDocs(collection(db, 'products'));
    if (prodSnap.empty) {
      const batch = writeBatch(db);
      INITIAL_PRODUCTS.forEach(p => {
        batch.set(doc(db, 'products', p.id), p);
      });
      await batch.commit();
      console.log('Seeded products in Firestore.');
    } else {
      const batch = writeBatch(db);
      let needsUpdate = false;
      prodSnap.forEach(d => {
        const data = d.data();
        if (data.imageUrl && (data.imageUrl.includes('unsplash.com') || data.imageUrl.startsWith('http'))) {
          const newUrl = d.id === 'rose' ? '/Rose.jpg' : '/Dahlia.jpg';
          batch.update(doc(db, 'products', d.id), { imageUrl: newUrl });
          needsUpdate = true;
        }
      });
      if (needsUpdate) {
        await batch.commit();
        console.log('Migrated Firestore product images to studio assets.');
      }
    }

    // Check inventory: ensure all 25 baseline items exist in Firestore
    const invSnap = await getDocs(collection(db, 'inventory'));
    const existingInvIds = new Set<string>();
    invSnap.forEach(d => existingInvIds.add(d.id));

    const missingItems = INITIAL_INVENTORY.filter(item => !existingInvIds.has(item.id));
    if (missingItems.length > 0) {
      const batch = writeBatch(db);
      missingItems.forEach(item => {
        batch.set(doc(db, 'inventory', item.id), {
          ...item,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });
      await batch.commit();
      console.log(`Seeded ${missingItems.length} missing inventory items in Firestore.`);
    }

    // Check studio settings
    const settingsRef = doc(db, 'studioSettings', 'content');
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      await setDoc(settingsRef, INITIAL_STUDIO_SETTINGS);
      console.log('Seeded studio settings in Firestore.');
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(SEED_CACHE_KEY, 'true');
      } catch {
        // ignore
      }
    }
  } catch (error) {
    console.warn('Initial seeding notice (normal if offline or already seeded):', error);
  }
}

/**
 * Pushes or refreshes all official studio stock items into Firestore.
 */
export async function syncOfficialInventoryToFirestore(db: Firestore): Promise<void> {
  const batch = writeBatch(db);
  INITIAL_INVENTORY.forEach(item => {
    batch.set(doc(db, 'inventory', item.id), {
      ...item,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  });
  await batch.commit();
  console.log('Synced official inventory items to Firestore.');
}

