import React, { useState } from "react";
import { useNavigate } from "react-router";
import { Heart, Stethoscope, User } from "lucide-react";
import { auth, db } from "../../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

interface ValidationErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
  name?: string;
  age?: string;
  sex?: string;
  license?: string;
  specialization?: string;
  terms?: string;
}

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [role, setRole] = useState("patient");
  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const navigate = useNavigate();

  function validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validateForm(): boolean {
    const errors: ValidationErrors = {};

    if (!email) {
      errors.email = "Email is required";
    } else if (!validateEmail(email)) {
      errors.email = "Invalid email address";
    }

    if (!password) {
      errors.password = "Password is required";
    } else if (password.length < 6) {
      errors.password = "Password must be at least 6 characters";
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your password";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    if (!name || name.trim().length === 0) {
      errors.name = "Full name is required";
    }

    if (!agreedToTerms) {
      errors.terms = "You must agree to the Terms & Conditions";
    }

    if (role === "patient") {
      if (!age || Number(age) < 1 || Number(age) > 150) {
        errors.age = "Please enter a valid age";
      }
      if (!sex) {
        errors.sex = "Please select your sex";
      }
    } else if (role === "doctor") {
      if (!licenseNumber || licenseNumber.trim().length === 0) {
        errors.license = "License number is required";
      }
      if (!specialization) {
        errors.specialization = "Please select a specialization";
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setValidationErrors({});

    if (!validateForm()) {
      setError("Please fix the errors below");
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userData: any = {
        name,
        email,
        role,
        createdAt: new Date().toISOString(),
      };

      if (phone.trim()) userData.phone = phone.trim();

      if (role === "patient") {
        userData.age = age;
        userData.sex = sex;
        userData.assignedDoctorId = null;
      } else if (role === "doctor") {
        userData.licenseNumber = licenseNumber;
        userData.specialization = specialization;
      }

      localStorage.setItem("userRole", role);
      localStorage.setItem("userId", user.uid);
      localStorage.setItem("userData", JSON.stringify(userData));

      try {
        await setDoc(doc(db, "users", user.uid), userData);
      } catch (firestoreError) {
        console.warn("Firestore save error (may be offline):", firestoreError);
      }

      alert(`Account created successfully! You are registered as a ${role}.`);
      navigate("/login");
    } catch (err: any) {
      let errorMessage = "Failed to create account. Please try again.";

      if (err.code === "auth/email-already-in-use") {
        errorMessage = "This email is already registered. Please login instead.";
      } else if (err.code === "auth/invalid-email") {
        errorMessage = "Invalid email address. Please enter a valid email.";
      } else if (err.code === "auth/weak-password") {
        errorMessage = "Password is too weak. Please use at least 6 characters.";
      } else if (err.code === "auth/network-request-failed") {
        errorMessage = "Network error. Please check your internet connection.";
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] p-6">
      <form
        className="relative bg-[var(--card)] p-8 rounded-xl shadow-sm w-full max-w-md border border-[var(--border)]"
        onSubmit={handleSignUp}
      >
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-[var(--primary)] rounded-full">
            <Heart className="w-10 h-10 text-white" fill="white" />
          </div>
        </div>

        <h1 className="text-3xl font-bold mb-2 text-center text-[var(--foreground)]">
          Create Account
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] text-center mb-6">
          Join our cardiovascular monitoring platform
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 rounded">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Role Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-[var(--foreground)] mb-2">I am a:</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRole("patient")}
              className={`flex flex-col items-center gap-2 py-3 px-4 rounded-xl border font-medium transition-all ${
                role === "patient"
                  ? "bg-[var(--accent)] border-[var(--primary)] text-[var(--primary)]"
                  : "bg-[var(--muted)] border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--secondary)]"
              }`}
            >
              <User className="w-5 h-5" />
              <span className="text-sm">Patient</span>
            </button>
            <button
              type="button"
              onClick={() => setRole("doctor")}
              className={`flex flex-col items-center gap-2 py-3 px-4 rounded-xl border font-medium transition-all ${
                role === "doctor"
                  ? "bg-[var(--accent)] border-[var(--primary)] text-[var(--primary)]"
                  : "bg-[var(--muted)] border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--secondary)]"
              }`}
            >
              <Stethoscope className="w-5 h-5" />
              <span className="text-sm">Doctor</span>
            </button>
          </div>
        </div>

        <input
          className="w-full p-3 border border-[var(--border)] rounded-lg mb-3 focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)] transition bg-[var(--input-background)]"
          placeholder="Full Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <input
          className="w-full p-3 border border-[var(--border)] rounded-lg mb-3 focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)] transition bg-[var(--input-background)]"
          type="tel"
          placeholder="WhatsApp Number (e.g. 03001234567)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        {role === "patient" ? (
          <>
            <input
              className="w-full p-3 border border-[var(--border)] rounded-lg mb-3 focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)] bg-[var(--input-background)]"
              type="number"
              placeholder="Age"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              required
            />
            {validationErrors.age && (
              <p className="text-red-600 text-xs -mt-2 mb-2">{validationErrors.age}</p>
            )}

            <select
              className="w-full p-3 border border-[var(--border)] rounded-lg mb-3 focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)] bg-[var(--input-background)]"
              value={sex}
              onChange={(e) => setSex(e.target.value)}
              required
            >
              <option value="">Select Sex</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Other">Other</option>
            </select>
            {validationErrors.sex && (
              <p className="text-red-600 text-xs -mt-2 mb-2">{validationErrors.sex}</p>
            )}

            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700">
                A doctor will be assigned to you by the admin after registration.
              </p>
            </div>
          </>
        ) : (
          <>
            <input
              className="w-full p-3 border border-[var(--border)] rounded-lg mb-3 focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)] bg-[var(--input-background)]"
              placeholder="License Number"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              required
            />
            {validationErrors.license && (
              <p className="text-red-600 text-xs -mt-2 mb-2">{validationErrors.license}</p>
            )}

            <select
              className="w-full p-3 border border-[var(--border)] rounded-lg mb-3 focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)] bg-[var(--input-background)]"
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
              required
            >
              <option value="">Select Specialization</option>
              <option value="Cardiology">Cardiology</option>
              <option value="General Practice">General Practice</option>
              <option value="Internal Medicine">Internal Medicine</option>
              <option value="Family Medicine">Family Medicine</option>
              <option value="Other">Other</option>
            </select>
            {validationErrors.specialization && (
              <p className="text-red-600 text-xs -mt-2 mb-2">{validationErrors.specialization}</p>
            )}
          </>
        )}

        <div className="mb-3">
          <input
            className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-[var(--ring)] bg-[var(--input-background)] transition ${
              validationErrors.email ? "border-red-500 bg-red-50" : "border-[var(--border)]"
            }`}
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (validationErrors.email) setValidationErrors(prev => ({ ...prev, email: undefined }));
            }}
            required
          />
          {validationErrors.email && (
            <p className="text-red-600 text-xs mt-1">{validationErrors.email}</p>
          )}
        </div>

        <div className="mb-3">
          <input
            className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-[var(--ring)] bg-[var(--input-background)] transition ${
              validationErrors.password ? "border-red-500 bg-red-50" : "border-[var(--border)]"
            }`}
            type="password"
            placeholder="Create Password (min 6 characters)"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (validationErrors.password) setValidationErrors(prev => ({ ...prev, password: undefined }));
            }}
            required
            minLength={6}
          />
          {validationErrors.password && (
            <p className="text-red-600 text-xs mt-1">{validationErrors.password}</p>
          )}
        </div>

        <div className="mb-4">
          <input
            className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-[var(--ring)] bg-[var(--input-background)] transition ${
              validationErrors.confirmPassword ? "border-red-500 bg-red-50" : "border-[var(--border)]"
            }`}
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (validationErrors.confirmPassword) setValidationErrors(prev => ({ ...prev, confirmPassword: undefined }));
            }}
            required
          />
          {validationErrors.confirmPassword && (
            <p className="text-red-600 text-xs mt-1">{validationErrors.confirmPassword}</p>
          )}
        </div>

        {/* Terms and Conditions */}
        <div className="mb-4">
          <label className={`flex items-start gap-2 cursor-pointer p-3 rounded-lg border transition ${
            validationErrors.terms ? "border-red-500 bg-red-50" : "border-[var(--border)] hover:border-[var(--primary)]"
          }`}>
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => {
                setAgreedToTerms(e.target.checked);
                if (validationErrors.terms) setValidationErrors(prev => ({ ...prev, terms: undefined }));
              }}
              className="mt-1 w-4 h-4 text-[var(--primary)] border-slate-300 rounded focus:ring-[var(--ring)]"
              required
            />
            <span className="text-sm text-[var(--foreground)]">
              I agree to the{" "}
              <span className="text-[var(--primary)] font-semibold hover:underline">Terms & Conditions</span>
              {" "}and{" "}
              <span className="text-[var(--primary)] font-semibold hover:underline">Privacy Policy</span>
            </span>
          </label>
          {validationErrors.terms && (
            <p className="text-red-600 text-xs mt-1">{validationErrors.terms}</p>
          )}
        </div>

        <button
          className="w-full py-3 text-white rounded-lg font-medium transition-all shadow-sm bg-[var(--primary)] hover:bg-orange-600"
          type="submit"
        >
          Sign Up as {role === "doctor" ? "Doctor" : "Patient"}
        </button>

        <p className="text-center mt-6 text-[var(--muted-foreground)]">
          Already have an account?{" "}
          <span
            className="text-[var(--primary)] cursor-pointer font-semibold hover:text-orange-600 hover:underline"
            onClick={() => navigate("/login")}
          >
            Login
          </span>
        </p>
      </form>
    </div>
  );
}
