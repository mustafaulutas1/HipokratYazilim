/**
 * Script to update all treatment protocols from "3 AYDA 1 KONTROL" to "4 AYDA 1 KONTROL"
 * 
 * Run this script with: node scripts/updateProtocolControl.js
 */

import 'dotenv/config';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

// Firebase configuration from .env file
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const OLD_CONTROL = '3 AYDA 1 KONTROL';
const NEW_CONTROL = '4 AYDA 1 KONTROL';

async function updateProtocols() {
  console.log('🔄 Starting protocol control update...');
  console.log(`   Changing "${OLD_CONTROL}" to "${NEW_CONTROL}"`);
  console.log('');

  try {
    // Get all treatment protocols
    const protocolsRef = collection(db, 'treatmentProtocols');
    const snapshot = await getDocs(protocolsRef);

    if (snapshot.empty) {
      console.log('❌ No protocols found in the database.');
      return;
    }

    console.log(`📊 Found ${snapshot.size} protocols in total.`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data();
      const currentControl = data.control;

      if (currentControl === OLD_CONTROL) {
        try {
          await updateDoc(doc(db, 'treatmentProtocols', docSnapshot.id), {
            control: NEW_CONTROL
          });
          console.log(`✅ Updated: ${data.name || docSnapshot.id}`);
          updatedCount++;
        } catch (error) {
          console.error(`❌ Error updating ${docSnapshot.id}:`, error.message);
          errorCount++;
        }
      } else {
        console.log(`⏭️  Skipped: ${data.name || docSnapshot.id} (control: "${currentControl}")`);
        skippedCount++;
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('📈 Update Summary:');
    console.log(`   ✅ Updated: ${updatedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log('═══════════════════════════════════════');
    console.log('');
    console.log('✨ Done!');

  } catch (error) {
    console.error('❌ Fatal error:', error);
  }

  process.exit(0);
}

// Run the update
updateProtocols();
