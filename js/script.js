// Initialize Supabase
const SUPABASE_URL = 'https://aagxdezjehqjyidkxrmk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhZ3hkZXpqZWhxanlpZGt4cm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzODgyNDksImV4cCI6MjA3ODk2NDI0OX0.vwE3alnBd04pm9JTGZ6yUD8WtqK8-kMaJFDWIRF1ips';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// -------------------- AUTH FUNCTIONS --------------------

// Sign up a new user
async function signUpUser(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    console.error('Sign-up error:', error.message);
    return null;
  }
  return data.user;
}

// Sign in existing user
async function signInUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('Sign-in error:', error.message);
    return null;
  }
  return data.user;
}

// -------------------- FILE UPLOAD FUNCTIONS --------------------

// Upload proof screenshot
async function uploadProof(file, userId) {
  const { data, error } = await supabase.storage
    .from('proof_uploads')
    .upload(`${userId}/${file.name}`, file, { cacheControl: '3600', upsert: true });

  if (error) {
    console.error('Upload error:', error.message);
    return null;
  }
  return data.path;
}

// List user's proof files
async function listProofs(userId) {
  const { data, error } = await supabase.storage
    .from('proof_uploads')
    .list(`${userId}/`);

  if (error) {
    console.error('Fetch proofs error:', error.message);
    return [];
  }
  return data;
}

// -------------------- PLACEHOLDER FOR FUTURE FEATURES --------------------

// TODO:
// - Fetch VCF categories for download page
// - Track coins and subscriptions
// - Fetch user demographics for matching
// - Handle sponsors and sponsor codes
// - Integrate OCR verification for proof screenshots
