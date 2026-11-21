'use client';

import { cn } from '@workspace/ui/lib/utils';
import { Button } from '@workspace/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@workspace/ui/components/field';
import { Input } from '@workspace/ui/components/input';
import { useAuthStore } from '@/store/useAuthStore';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoginFormSchema } from '@/app/auth/lib/type';

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const { signIn } = useAuthStore();
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setGlobalError(null);
    setFieldErrors({});

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData);

    const validation = LoginFormSchema.safeParse(data);
    if (!validation.success) {
      setFieldErrors(validation.error.flatten().fieldErrors);
      setLoading(false);
      return;
    }

    try {
      await signIn(validation.data);
      router.push('/messages');
    } catch (err: any) {
      setGlobalError(
        err.response?.data?.message || 'Invalid email or password',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Sign in to your account</CardTitle>
          <CardDescription>
            Enter your email below to sign in to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              {globalError && (
                <p className="text-sm text-red-500">{globalError}</p>
              )}
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                />
                {fieldErrors.email && (
                  <p className="text-sm text-red-500">{fieldErrors.email[0]}</p>
                )}
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <a
                    href="#"
                    className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                  >
                    Forgot your password?
                  </a>
                </div>
                <Input id="password" name="password" type="password" required />
                {fieldErrors.password && (
                  <p className="text-sm text-red-500">
                    {fieldErrors.password[0]}
                  </p>
                )}
              </Field>
              <Field>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Authenticating...' : 'Sign In'}
                </Button>
                <Button variant="outline" type="button" className="w-full">
                  Sign in with Google
                </Button>
                <FieldDescription className="text-center">
                  Don&apos;t have an account? <a href="/auth/signup">Sign up</a>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
