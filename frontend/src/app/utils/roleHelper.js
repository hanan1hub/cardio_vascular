export const getStoredRole = () => {
  return localStorage.getItem("userRole");
};

export const setStoredRole = (role) => {
  localStorage.setItem("userRole", role);
  console.log("Role updated to:", role);
};

export const checkUserRole = async (userId, db) => {
  try {
    const { doc, getDoc } = await import("firebase/firestore");
    const userDoc = await getDoc(doc(db, "users", userId));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return userData?.role || null;
    }
  } catch (error) {
    console.error("Error checking user role:", error);
  }
  return null;
};

// Debug function - can be called from browser console
if (typeof window !== "undefined") {

  window.fixDoctorRole = () => {
    const role = localStorage.getItem("userRole");
    if (role !== "doctor") {
      localStorage.setItem("userRole", "doctor");
      console.log("✅ Role fixed! Refreshing page...");
      window.location.reload();
    } else {
      console.log("Role is already set to doctor");
    }
  };
}