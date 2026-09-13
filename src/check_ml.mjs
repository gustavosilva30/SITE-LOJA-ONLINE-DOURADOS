
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMLProducts() {
    const { data, count, error } = await supabase
        .from('produtos')
        .select('*', { count: 'exact' })
        .not('meli_id', 'is', null);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Found ${count} products with meli_id`);
    if (data && data.length > 0) {
        console.log('Sample product:', JSON.stringify(data[0], null, 2));
    }

    // Check if they are active
    const { count: activeCount } = await supabase
        .from('produtos')
        .select('*', { count: 'exact', head: true })
        .not('meli_id', 'is', null)
        .eq('ativo', true);

    console.log(`Active ML products: ${activeCount}`);
}

checkMLProducts();
