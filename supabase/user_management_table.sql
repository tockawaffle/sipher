-- Drop everything related to users
DROP TABLE IF EXISTS public.users CASCADE;

-- Create new users table
CREATE TABLE public.users (
    uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suuid CHAR(8) UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL CHECK (length(username) >= 3 AND username ~ '^[a-zA-Z0-9_-]+$'),
    indexable BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create trigger function for SUUID generation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    NEW.suuid := public.generate_short_uuid();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER on_user_created
    BEFORE INSERT ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Add policies
CREATE POLICY "Users can view their own profile" ON public.users
    FOR SELECT USING (auth.uid() = uuid);

CREATE POLICY "Users can view indexable profiles" ON public.users
    FOR SELECT USING (indexable = true);

CREATE POLICY "Allow user registration" ON public.users
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own profile" ON public.users
    FOR UPDATE USING (auth.uid() = uuid);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create index for better performance
CREATE INDEX idx_users_suuid ON public.users(suuid);
CREATE INDEX idx_users_indexable ON public.users(indexable) WHERE indexable = true;
