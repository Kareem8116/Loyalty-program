import { NextRequest, NextResponse } from 'next/server';
import { uploadOfferImage } from '@/lib/offers';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    // Convert file to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const publicUrl = await uploadOfferImage(
      buffer,
      file.name || 'offer.jpg',
      file.type || 'image/jpeg'
    );

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (err: any) {
    console.error('Error uploading offer image:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
