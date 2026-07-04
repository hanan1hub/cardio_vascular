import Login from "./Login";

export default function LoginWrapper() {
  const handleLogin = () => {
    console.log("Login successful");
  };
  
  return <Login onLogin={handleLogin} />;
}
