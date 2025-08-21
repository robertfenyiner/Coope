import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  FiHome, 
  FiDollarSign, 
  FiTag, 
  FiUser, 
  FiMenu, 
  FiX,
  FiLogOut,
  FiFileText,
  FiSettings
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { getInitials } from '../utils/format';
import ThemeToggle from './ThemeToggle';
import { getProfilePictureUrl } from '../utils/config';

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, profilePictureVersion } = useAuth();
  const location = useLocation();

  const baseNavigation = [
    { name: 'Inicio', href: '/dashboard', icon: FiHome },
    { name: 'Gastos', href: '/expenses', icon: FiDollarSign },
    { name: 'Categorías', href: '/categories', icon: FiTag },
    { name: 'Reportes', href: '/reports', icon: FiFileText },
    { name: 'Perfil', href: '/profile', icon: FiUser },
  ];

  const adminNavigation = [
    { name: 'Administración', href: '/admin', icon: FiSettings },
  ];

  const navigation = user?.is_admin 
    ? [...baseNavigation.slice(0, -1), ...adminNavigation, baseNavigation[baseNavigation.length - 1]]
    : baseNavigation;

  const isCurrentPath = (path: string) => location.pathname === path;
  
  const getProfilePictureUrlWithVersion = (filename: string) => {
    return getProfilePictureUrl(filename, profilePictureVersion);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex transition-colors duration-300">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed z-30 inset-y-0 left-0 w-64 bg-white dark:bg-gray-800 shadow-lg transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:inset-0 lg:translate-x-0 lg:shadow-none
        `}
        style={{ height: '100vh' }}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-lg lg:text-xl font-bold text-gray-900 dark:text-gray-100 truncate">Gastos Robert</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <FiX className="w-6 h-6" />
          </button>
        </div>

        <nav className="mt-4 lg:mt-8 px-4">
          <ul className="flex flex-col gap-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`
                      flex flex-row items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200
                      ${isCurrentPath(item.href)
                        ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 border-r-2 border-primary-600 dark:border-primary-400'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }
                    `}
                  >
                    <Icon className="w-5 h-5 mr-3" />
                    <span>{item.name}</span>
                  </Link>
                  </li>
              );
            })}
          </ul>
        </nav>

        {/* User info and logout */}
        <div className="absolute bottom-0 w-full p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center text-white text-base font-bold overflow-hidden">
              {user?.profile_picture ? (
                <img
                  src={getProfilePictureUrlWithVersion(user.profile_picture)}
                  alt={user.username}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <span className={user?.profile_picture ? 'hidden' : ''}>
                {user ? getInitials(user.username) : 'U'}
              </span>
            </div>
            <div className="hidden lg:block ml-3">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.username}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200"
          >
            <FiLogOut className="w-5 h-5 mr-3" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:ml-64">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <FiMenu className="w-6 h-6" />
            </button>

            <div className="flex items-center space-x-4">
              <div className="hidden sm:block">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {navigation.find(item => isCurrentPath(item.href))?.name || 'Panel'}
                </h2>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <ThemeToggle className="hidden sm:block" />
              <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-white text-sm font-medium lg:hidden overflow-hidden">
                {user?.profile_picture ? (
                  <img
                    src={getProfilePictureUrlWithVersion(user.profile_picture)}
                    alt={user.username}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <span className={user?.profile_picture ? 'hidden' : ''}>
                  {user ? getInitials(user.username) : 'U'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="p-4 sm:p-6 lg:p-8 mobile-safe-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;