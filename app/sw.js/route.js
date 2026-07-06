import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'sw.js');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return new NextResponse(fileContent, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (error) {
    // Return a self-cleaning fallback service worker if the file cannot be read
    const fallback = `
      self.addEventListener('install', (e) => self.skipWaiting());
      self.addEventListener('activate', (e) => {
        self.registration.unregister()
          .then(() => self.clients.claim());
      });
    `;
    return new NextResponse(fallback, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-store',
      },
    });
  }
}
