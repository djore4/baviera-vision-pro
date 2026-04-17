import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

const Index = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    if (redirect) navigate(redirect, { replace: true });
  }, []);
  return <Navigate to="/retails" replace />;
};
export default Index;
