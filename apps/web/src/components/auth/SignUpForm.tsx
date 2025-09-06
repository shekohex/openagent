import { useAuthActions } from "@convex-dev/auth/react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MIN_NAME_LENGTH = 2;
const MIN_PASSWORD_LENGTH = 8;

const signUpSchema = z
  .object({
    name: z.string().min(MIN_NAME_LENGTH, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export function SignUpForm() {
  const { signIn } = useAuthActions();

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    validators: {
      onChange: signUpSchema,
    },
    onSubmit: async ({ value }) => {
      await signIn("password", {
        email: value.email,
        password: value.password,
        name: value.name,
        flow: "signUp",
      });
    },
  });

  return (
    <div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <div>
          <form.Field name="name">
            {(field) => (
              <>
                <Label htmlFor={field.name}>Name</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Enter your name"
                  type="text"
                  value={field.state.value}
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="mt-1 text-red-600 text-sm">
                    {String(field.state.meta.errors[0])}
                  </p>
                )}
              </>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="email">
            {(field) => (
              <>
                <Label htmlFor={field.name}>Email</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Enter your email"
                  type="email"
                  value={field.state.value}
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="mt-1 text-red-600 text-sm">
                    {String(field.state.meta.errors[0])}
                  </p>
                )}
              </>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="password">
            {(field) => (
              <>
                <Label htmlFor={field.name}>Password</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Enter your password"
                  type="password"
                  value={field.state.value}
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="mt-1 text-red-600 text-sm">
                    {String(field.state.meta.errors[0])}
                  </p>
                )}
              </>
            )}
          </form.Field>
        </div>

        <div>
          <form.Field name="confirmPassword">
            {(field) => (
              <>
                <Label htmlFor={field.name}>Confirm Password</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Confirm your password"
                  type="password"
                  value={field.state.value}
                />
                {field.state.meta.errors.length > 0 && (
                  <p className="mt-1 text-red-600 text-sm">
                    {String(field.state.meta.errors[0])}
                  </p>
                )}
              </>
            )}
          </form.Field>
        </div>

        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
        >
          {([canSubmit, isSubmitting]) => (
            <Button className="w-full" disabled={!canSubmit} type="submit">
              {isSubmitting ? "Creating account..." : "Sign Up"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </div>
  );
}
