import React, { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../../firebase";
import { ClipboardList, Check } from "lucide-react";

interface QuestionnaireFormProps {
  onSuccess?: () => void;
}

export default function QuestionnaireForm({ onSuccess }: QuestionnaireFormProps) {
  const [formData, setFormData] = useState({
    has_hypertension: false,
    has_diabetes: false,
    has_heart_disease: false,
    has_high_cholesterol: false,
    smoking_status: "never",
    exercise_frequency: "none",
    family_history: false,
    current_medications: "",
    temperature: "",
    weight: "",
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;

    if (type === "checkbox") {
      const target = e.target as HTMLInputElement;
      setFormData(prev => ({
        ...prev,
        [name]: target.checked
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const patientId = localStorage.getItem("userId");
      if (!patientId) {
        alert("Please log in to submit the questionnaire.");
        return;
      }

      await addDoc(collection(db, "healthQuestionnaires"), {
        ...formData,
        patientId,
        timestamp: serverTimestamp(),
      });

      if (onSuccess) {
        onSuccess();
      }

      alert("Health questionnaire saved successfully!");
    } catch (error) {
      console.error("Error saving questionnaire:", error);
      alert("Failed to save questionnaire. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--card)] rounded-xl shadow-sm border border-[var(--border)] p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-[var(--primary)] rounded-xl">
          <ClipboardList className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Health Questionnaire</h2>
          <p className="text-sm text-[var(--muted-foreground)]">Complete your medical history</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Medical Conditions */}
        <div className="border border-[var(--border)] rounded-xl p-5 bg-[var(--muted)]">
          <h3 className="font-medium text-[var(--foreground)] mb-4">Current Medical Conditions</h3>
          <div className="space-y-3">
            {[ 
              { name: "has_hypertension", label: "Hypertension (High Blood Pressure)" },
              { name: "has_diabetes", label: "Diabetes" },
              { name: "has_heart_disease", label: "Heart Disease" },
              { name: "has_high_cholesterol", label: "High Cholesterol" }
            ].map((condition) => (
              <label key={condition.name} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name={condition.name}
                  checked={formData[condition.name as keyof typeof formData] as boolean}
                  onChange={handleChange}
                  className="w-5 h-5 text-[var(--primary)] rounded border-2 border-slate-300 focus:ring-2 focus:ring-[var(--ring)]"
                />
                <span className="text-[var(--foreground)]">{condition.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Lifestyle */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Smoking Status
            </label>
            <select
              name="smoking_status"
              value={formData.smoking_status}
              onChange={handleChange}
              className="w-full p-3 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)] transition bg-[var(--input-background)]"
            >
              <option value="never">Never</option>
              <option value="former">Former Smoker</option>
              <option value="current">Current Smoker</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
              Exercise Frequency
            </label>
            <select
              name="exercise_frequency"
              value={formData.exercise_frequency}
              onChange={handleChange}
              className="w-full p-3 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)] transition bg-[var(--input-background)]"
            >
              <option value="none">None</option>
              <option value="1-2">1-2 times/week</option>
              <option value="3-4">3-4 times/week</option>
              <option value="5+">5+ times/week</option>
            </select>
          </div>
        </div>

        {/* Family History */}
        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="family_history"
              checked={formData.family_history}
              onChange={handleChange}
              className="w-5 h-5 text-[var(--primary)] rounded border-2 border-slate-300 focus:ring-2 focus:ring-[var(--ring)]"
            />
            <span className="text-[var(--foreground)] font-medium">Family history of cardiovascular disease</span>
          </label>
        </div>

        {/* Temperature Dropdown */}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
            Temperature (°C)
          </label>
          <select
            name="temperature"
            value={formData.temperature}
            onChange={handleChange}
            className="w-full p-3 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)] transition bg-[var(--input-background)]"
          >
            <option value="">Select Temperature</option>
            <option value="normal">Normal</option>
            <option value="fever">Fever</option>
          </select>
        </div>

        {/* Weight Dropdown */}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
            Weight (kg)
          </label>
          <select
            name="weight"
            value={formData.weight}
            onChange={handleChange}
            className="w-full p-3 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)] transition bg-[var(--input-background)]"
          >
            <option value="">Select Weight</option>
            <option value="underweight">Underweight</option>
            <option value="normal">Normal</option>
            <option value="overweight">Overweight</option>
            <option value="obese">Obese</option>
          </select>
        </div>

        {/* Current Medications */}
        <div>
          <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
            Current Medications
          </label>
          <textarea
            name="current_medications"
            value={formData.current_medications}
            onChange={handleChange}
            className="w-full p-3 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)] transition resize-none bg-[var(--input-background)]"
            placeholder="List any medications you're currently taking..."
            rows={4}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-[var(--primary)] text-white rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50 transition shadow-sm flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Saving...
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              Submit Questionnaire
            </>
          )}
        </button>
      </form>
    </div>
  );
}