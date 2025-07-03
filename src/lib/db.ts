import Dexie, { type Table } from 'dexie';
import type { BookNode } from '@/types';

export interface BookDataStoreEntry {
  id: string; // Primary key, e.g., 'currentBook'
  data: BookNode;
  timestamp: Date;
}

export interface ImageDataStoreEntry {
  id: string; // Primary key, a unique ID for the image
  data: Blob; // The image data itself
  timestamp: Date;
}

export class ComposeWriteDexie extends Dexie {
  book!: Table<BookDataStoreEntry, string>;
  images!: Table<ImageDataStoreEntry, string>; // New table for images

  constructor() {
    super('ComposeWriteDB'); // Database name
    this.version(2).stores({
      book: 'id, timestamp',
      images: 'id, timestamp', // Define the new table
    });
    this.version(1).stores({
      book: 'id, timestamp',
    });
  }
}

export const db = new ComposeWriteDexie();

/**
 * Saves an image blob to IndexedDB.
 * @param id The unique ID for the image.
 * @param blob The image blob data.
 */
export async function saveImage(id: string, blob: Blob): Promise<void> {
  try {
    await db.images.put({
      id,
      data: blob,
      timestamp: new Date(),
    });
    // console.log(`Image ${id} saved to IndexedDB`);
  } catch (error) {
    console.error(`Failed to save image ${id} to IndexedDB:`, error);
    throw error;
  }
}

/**
 * Loads an image blob from IndexedDB.
 * @param id The unique ID of the image to load.
 * @returns The image Blob if found, otherwise null.
 */
export async function loadImage(id: string): Promise<Blob | null> {
  try {
    const storedImage = await db.images.get(id);
    if (storedImage) {
      // console.log(`Image ${id} loaded from IndexedDB`);
      return storedImage.data;
    }
    // console.log(`Image ${id} not found in IndexedDB`);
    return null;
  } catch (error) {
    console.error(`Failed to load image ${id} from IndexedDB:`, error);
    return null;
  }
}

/**
 * Deletes an image from IndexedDB.
 * @param id The unique ID of the image to delete.
 */
export async function deleteImage(id: string): Promise<void> {
  try {
    await db.images.delete(id);
    // console.log(`Image ${id} deleted from IndexedDB`);
  } catch (error) {
    console.error(`Failed to delete image ${id} from IndexedDB:`, error);
    throw error;
  }
}

/**
 * Saves the entire book data object to IndexedDB.
 * @param bookData The BookNode object to save.
 */
export async function saveBookData(bookData: BookNode): Promise<void> {
  try {
    await db.book.put({
      id: 'currentBook', // Use a fixed ID to always update the same record
      data: bookData,
      timestamp: new Date(),
    });
    // console.log('Book data saved to IndexedDB');
  } catch (error) {
    console.error('Failed to save book data to IndexedDB:', error);
    // Optionally, re-throw or handle the error for UI feedback
    throw error;
  }
}

/**
 * Loads the book data object from IndexedDB.
 * @returns The BookNode object if found, otherwise null.
 */
export async function loadBookData(): Promise<BookNode | null> {
  try {
    const storedEntry = await db.book.get('currentBook');
    if (storedEntry) {
      // console.log('Book data loaded from IndexedDB');
      return storedEntry.data;
    }
    // console.log('No book data found in IndexedDB');
    return null;
  } catch (error) {
    console.error('Failed to load book data from IndexedDB:', error);
    // Optionally, re-throw or handle the error
    return null; // Or throw error to be caught by caller
  }
}

/**
 * Deletes the entire IndexedDB database for ComposeWrite.
 */
export async function deleteDatabase(): Promise<void> {
  try {
    if (db.isOpen()) {
      db.close(); // Close the current connection if it's open
    }
    // Use the static Dexie.delete method to ensure the DB is deleted by name
    await Dexie.delete('ComposeWriteDB');
    console.log('ComposeWriteDB deleted successfully using Dexie.delete().');
  } catch (error) {
    console.error('Failed to delete ComposeWriteDB:', error);
    // Rethrow the error to be caught by the caller
    throw error;
  }
}
