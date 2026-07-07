const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

exports.adminChangePassword = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const callerDoc = await admin.firestore()
    .collection('users').doc(request.auth.uid).get();
  if (!callerDoc.data()?.isAdmin) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }

  const { uid, password } = request.data;
  if (!uid || !password) {
    throw new HttpsError('invalid-argument', 'uid and password are required.');
  }
  if (password.length < 6) {
    throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.');
  }

  await admin.auth().updateUser(uid, { password });
  return { success: true };
});
