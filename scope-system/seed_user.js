const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const email = 'lab1@scope.local';
  // Use the password they had in their .env.local file
  const password = process.env.LAB1_PASSWORD || 'testpassword123';

  console.log(`Creating user ${email}...`);

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true // bypass email confirmation
  });

  if (error) {
    if (error.message.includes('already registered')) {
      console.log('User already exists. Updating password to be sure...');
      
      // Get the user ID first
      const { data: users } = await supabase.auth.admin.listUsers();
      const user = users.users.find(u => u.email === email);
      
      if (user) {
        await supabase.auth.admin.updateUserById(user.id, { password });
        console.log('User password updated successfully!');
      }
    } else {
      console.error('Error creating user:', error.message);
    }
  } else {
    console.log('User created successfully:', data.user.id);
  }
}

main();
