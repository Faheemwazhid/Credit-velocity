import { useState, useEffect, useRef } from "react";
import "./App.css";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function App() {
  // State for form inputs
  const [loanAmount, setLoanAmount] = useState(300000);
  const [interestRate, setInterestRate] = useState(5.5);
  const [loanTerm, setLoanTerm] = useState(30);
  const [monthlyIncome, setMonthlyIncome] = useState(6000);
  const [monthlyExpenses, setMonthlyExpenses] = useState(4000);
  const [locLimit, setLocLimit] = useState(20000);
  const [locInterestRate, setLocInterestRate] = useState(7.0);
  const [activeTab, setActiveTab] = useState('comparison');
  
  // Calculated values
  const [monthlyPayment, setMonthlyPayment] = useState(0);
  const [extraPaymentAmount, setExtraPaymentAmount] = useState(0);
  const [locChunkSize, setLocChunkSize] = useState(10000);
  
  // Added paycheck parking option
  const [paycheckParking, setPaycheckParking] = useState(false);

  // Results for each strategy
  const [traditionalResults, setTraditionalResults] = useState({ totalInterest: 0, totalPayments: 0, payoffMonths: 0 });
  const [extraPaymentResults, setExtraPaymentResults] = useState({ totalInterest: 0, totalPayments: 0, payoffMonths: 0 });
  const [locResults, setLocResults] = useState({ totalInterest: 0, totalPayments: 0, payoffMonths: 0 });
  
  // Amortization schedules
  const [traditionalSchedule, setTraditionalSchedule] = useState([]);
  const [extraPaymentSchedule, setExtraPaymentSchedule] = useState([]);
  const [locSchedule, setLocSchedule] = useState([]);
  
  // State for managing paginated tables
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(12); // Show 1 year at a time
  
  // Chart data
  const [balanceChartData, setBalanceChartData] = useState({
    labels: [],
    datasets: []
  });

  const [comparisonChartData, setComparisonChartData] = useState({
    labels: [],
    datasets: []
  });

  // Calculate monthly payment using standard mortgage formula
  const calculateMonthlyPayment = (principal, annualRate, years) => {
    const monthlyRate = annualRate / 100 / 12;
    const numPayments = years * 12;
    if (monthlyRate === 0) return principal / numPayments;
    return principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
  };

  // Calculate results for traditional EMI payment with full amortization schedule
  const calculateTraditionalPayment = () => {
    const monthlyRate = interestRate / 100 / 12;
    const numPayments = loanTerm * 12;
    const payment = calculateMonthlyPayment(loanAmount, interestRate, loanTerm);
    
    let remainingBalance = loanAmount;
    let totalInterest = 0;
    let balanceByMonth = [loanAmount];
    let schedule = [];
    
    for (let i = 1; i <= numPayments && remainingBalance > 0; i++) {
      const interestForMonth = remainingBalance * monthlyRate;
      const principalForMonth = Math.min(payment - interestForMonth, remainingBalance);
      
      remainingBalance = Math.max(0, remainingBalance - principalForMonth);
      totalInterest += interestForMonth;
      
      balanceByMonth.push(remainingBalance);
      
      // Add to amortization schedule
      schedule.push({
        month: i,
        payment: payment,
        principal: principalForMonth,
        interest: interestForMonth,
        totalInterest: totalInterest,
        balance: remainingBalance,
        date: getDateAfterMonths(i)
      });
      
      // If we've paid off the loan, break
      if (remainingBalance === 0) break;
    }
    
    setTraditionalSchedule(schedule);
    
    return {
      totalInterest,
      totalPayments: totalInterest + loanAmount,
      payoffMonths: schedule.length,
      balanceByMonth
    };
  };

  // Calculate results for extra payment strategy with full amortization schedule
  const calculateExtraPaymentStrategy = () => {
    const monthlyRate = interestRate / 100 / 12;
    const numPayments = loanTerm * 12;
    const basePayment = calculateMonthlyPayment(loanAmount, interestRate, loanTerm);
    const extraPayment = Math.max(0, monthlyIncome - monthlyExpenses - basePayment);
    
    let remainingBalance = loanAmount;
    let totalInterest = 0;
    let balanceByMonth = [loanAmount];
    let schedule = [];
    
    for (let i = 1; i <= numPayments && remainingBalance > 0; i++) {
      const interestForMonth = remainingBalance * monthlyRate;
      const principalFromBase = Math.min(basePayment - interestForMonth, remainingBalance);
      const principalFromExtra = Math.min(extraPayment, remainingBalance - principalFromBase);
      const totalPrincipalForMonth = principalFromBase + principalFromExtra;
      const totalPaymentForMonth = interestForMonth + totalPrincipalForMonth;
      
      remainingBalance = Math.max(0, remainingBalance - totalPrincipalForMonth);
      totalInterest += interestForMonth;
      
      balanceByMonth.push(remainingBalance);
      
      // Add to amortization schedule
      schedule.push({
        month: i,
        basePayment: basePayment, 
        extraPayment: extraPayment,
        totalPayment: totalPaymentForMonth,
        principalFromBase: principalFromBase,
        principalFromExtra: principalFromExtra,
        interest: interestForMonth,
        totalInterest: totalInterest,
        balance: remainingBalance,
        date: getDateAfterMonths(i)
      });
      
      // If we've paid off the loan, break
      if (remainingBalance === 0) break;
    }
    
    setExtraPaymentSchedule(schedule);
    
    return {
      totalInterest,
      totalPayments: totalInterest + loanAmount,
      payoffMonths: schedule.length,
      balanceByMonth,
      extraPaymentAmount: extraPayment
    };
  };

  // Calculate results for LOC chunking strategy with full amortization schedule
  const calculateLocStrategy = () => {
    const monthlyRate = interestRate / 100 / 12;
    const locMonthlyRate = locInterestRate / 100 / 12;
    const numPayments = loanTerm * 12;
    const basePayment = calculateMonthlyPayment(loanAmount, interestRate, loanTerm);
    const availableCashFlow = monthlyIncome - monthlyExpenses;
    
    let remainingBalance = loanAmount;
    let locBalance = 0;
    let totalInterest = 0;
    let locInterest = 0;
    let balanceByMonth = [loanAmount];
    let schedule = [];
    let month = 1;
    let chunkApplied = false;
    
    // Apply initial chunk payment if possible
    if (locChunkSize <= locLimit) {
      remainingBalance -= locChunkSize;
      locBalance = locChunkSize;
      chunkApplied = true;
    }
    
    while (month <= numPayments && (remainingBalance > 0 || locBalance > 0)) {
      // Calculate interest for both loans
      const mortgageInterestForMonth = remainingBalance * monthlyRate;
      const locInterestForMonth = locBalance * locMonthlyRate;
      
      // Make minimum mortgage payment
      let cashFlowRemaining = availableCashFlow;
      const principalForMonth = Math.min(basePayment - mortgageInterestForMonth, remainingBalance);
      remainingBalance = Math.max(0, remainingBalance - principalForMonth);
      totalInterest += mortgageInterestForMonth;
      
      let locPayment = 0;
      let locPrincipalPayment = 0;
      let locDraw = 0;
      
      // Handle different LOC strategies
      if (paycheckParking) {
        // Paycheck Parking Strategy
        // 1. Deposit entire paycheck to LOC (reduces LOC balance)
        locPrincipalPayment = monthlyIncome;
        
        // 2. Draw living expenses from LOC
        locDraw = monthlyExpenses;
        
        // 3. Draw mortgage payment from LOC if needed
        locDraw += (mortgageInterestForMonth + principalForMonth);
        
        // Calculate net effect on LOC
        locPayment = Math.max(0, locPrincipalPayment - locDraw);
        
        // If we need to draw more than we deposit, increase LOC balance
        if (locDraw > locPrincipalPayment) {
          const additionalDraw = locDraw - locPrincipalPayment;
          locBalance = Math.min(locLimit, locBalance + additionalDraw);
        } else {
          // Otherwise reduce LOC balance
          locBalance = Math.max(0, locBalance + locInterestForMonth - locPayment);
        }
      } else {
        // Regular Extra Payment Strategy
        cashFlowRemaining -= (mortgageInterestForMonth + principalForMonth);
        
        // Pay down LOC with remaining cash flow
        locPayment = Math.min(locBalance + locInterestForMonth, cashFlowRemaining);
        locPrincipalPayment = Math.max(0, locPayment - locInterestForMonth);
        locBalance = Math.max(0, locBalance + locInterestForMonth - locPayment);
      }
      
      locInterest += locInterestForMonth;
      
      // Record if we're applying a new chunk this month
      let newChunkApplied = false;
      
      // Apply another chunk if LOC is paid off and there's room
      if (locBalance === 0 && remainingBalance > locChunkSize && locChunkSize <= locLimit) {
        remainingBalance -= locChunkSize;
        locBalance = locChunkSize;
        newChunkApplied = true;
      }
      
      balanceByMonth.push(remainingBalance);
      
      // Add to amortization schedule in format matching the image
      schedule.push({
        pmtNo: month,
        date: getDateAfterMonths(month),
        payment: basePayment,
        interest: mortgageInterestForMonth,
        principalPaid: principalForMonth,
        balance: remainingBalance,
        rate: locInterestRate,
        locPayment: locPayment,
        draw: locDraw,
        interestToMrtg: mortgageInterestForMonth,
        interestAccrued: locInterestForMonth,
        interestPaid: locInterestForMonth > locPayment ? locPayment : locInterestForMonth,
        locPrinBalance: locBalance + locInterestForMonth,
        locPaid: locPrincipalPayment,
        locBalance: locBalance,
        totalOwed: remainingBalance + locBalance,
        chunkApplied: month === 1 ? chunkApplied : newChunkApplied,
        totalInterest: totalInterest + locInterest
      });
      
      month++;
    }
    
    setLocSchedule(schedule);
    
    return {
      totalInterest: totalInterest + locInterest,
      totalPayments: totalInterest + locInterest + loanAmount,
      payoffMonths: month - 1,
      balanceByMonth
    };
  };
  
  // Helper function to get formatted date X months from now
  const getDateAfterMonths = (months) => {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  };
  
  // Pagination helpers
  const totalPages = (scheduleLength) => Math.ceil(scheduleLength / rowsPerPage);
  
  const pageNumbers = (totalPages) => {
    let pages = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
    return pages;
  };
  
  const getPaginatedData = (schedule) => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return schedule.slice(startIndex, startIndex + rowsPerPage);
  };

  // Update calculations when inputs change
  useEffect(() => {
    // Calculate base monthly payment
    const calculatedPayment = calculateMonthlyPayment(loanAmount, interestRate, loanTerm);
    setMonthlyPayment(calculatedPayment);
    
    // Calculate available cash for extra payments
    const availableCash = monthlyIncome - monthlyExpenses - calculatedPayment;
    setExtraPaymentAmount(Math.max(0, availableCash));
    
    // Calculate results for each strategy
    const traditional = calculateTraditionalPayment();
    const extraPayment = calculateExtraPaymentStrategy();
    const loc = calculateLocStrategy();
    
    setTraditionalResults({
      totalInterest: traditional.totalInterest,
      totalPayments: traditional.totalPayments,
      payoffMonths: traditional.payoffMonths
    });
    
    setExtraPaymentResults({
      totalInterest: extraPayment.totalInterest,
      totalPayments: extraPayment.totalPayments,
      payoffMonths: extraPayment.payoffMonths,
    });
    
    setLocResults({
      totalInterest: loc.totalInterest,
      totalPayments: loc.totalPayments,
      payoffMonths: loc.payoffMonths
    });
    
    // Create labels for months (up to the longest payoff period)
    const maxMonths = Math.max(traditional.balanceByMonth.length, extraPayment.balanceByMonth.length, loc.balanceByMonth.length);
    const labels = Array.from({ length: maxMonths }, (_, i) => `Year ${Math.floor(i / 12) + 1}, Month ${i % 12 + 1}`);
    
    // Pad shorter balance arrays with zeros
    const traditionalBalance = traditional.balanceByMonth.concat(Array(maxMonths - traditional.balanceByMonth.length).fill(0));
    const extraPaymentBalance = extraPayment.balanceByMonth.concat(Array(maxMonths - extraPayment.balanceByMonth.length).fill(0));
    const locBalance = loc.balanceByMonth.concat(Array(maxMonths - loc.balanceByMonth.length).fill(0));
    
    // Update balance chart data
    setBalanceChartData({
      labels: labels,
      datasets: [
        {
          label: 'Traditional EMI',
          data: traditionalBalance,
          borderColor: 'rgb(53, 162, 235)',
          backgroundColor: 'rgba(53, 162, 235, 0.5)',
        },
        {
          label: 'Extra Payment',
          data: extraPaymentBalance,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.5)',
        },
        {
          label: 'LOC Strategy',
          data: locBalance,
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
        },
      ],
    });
    
    // Update comparison chart data
    setComparisonChartData({
      labels: ['Total Interest', 'Payoff Time (Years)'],
      datasets: [
        {
          label: 'Traditional EMI',
          data: [traditional.totalInterest, traditional.payoffMonths / 12],
          backgroundColor: 'rgba(53, 162, 235, 0.7)',
        },
        {
          label: 'Extra Payment',
          data: [extraPayment.totalInterest, extraPayment.payoffMonths / 12],
          backgroundColor: 'rgba(75, 192, 192, 0.7)',
        },
        {
          label: 'LOC Strategy',
          data: [loc.totalInterest, loc.payoffMonths / 12],
          backgroundColor: 'rgba(255, 99, 132, 0.7)',
        },
      ],
    });
  }, [loanAmount, interestRate, loanTerm, monthlyIncome, monthlyExpenses, locLimit, locInterestRate, locChunkSize, paycheckParking]);

  // Pagination Component
  const PaginationControls = ({ schedule }) => {
    const totalPagesCount = totalPages(schedule.length);
    
    return (
      <div className="flex items-center justify-between mt-4 mb-2">
        <div className="flex items-center">
          <span className="text-sm text-gray-700 mr-2">
            Rows per page:
          </span>
          <select 
            className="border border-gray-300 rounded px-2 py-1 text-sm"
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setCurrentPage(1); // Reset to first page when changing rows per page
            }}
          >
            <option value={12}>12 (1 year)</option>
            <option value={24}>24 (2 years)</option>
            <option value={60}>60 (5 years)</option>
            <option value={120}>120 (10 years)</option>
          </select>
        </div>
        
        <div className="flex items-center space-x-1">
          <button
            className={`px-3 py-1 rounded ${currentPage === 1 ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
          >
            First
          </button>
          <button
            className={`px-3 py-1 rounded ${currentPage === 1 ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
          >
            Prev
          </button>
          
          <span className="px-3 py-1 text-sm">
            Page {currentPage} of {totalPagesCount}
          </span>
          
          <button
            className={`px-3 py-1 rounded ${currentPage === totalPagesCount ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPagesCount))}
            disabled={currentPage === totalPagesCount}
          >
            Next
          </button>
          <button
            className={`px-3 py-1 rounded ${currentPage === totalPagesCount ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
            onClick={() => setCurrentPage(totalPagesCount)}
            disabled={currentPage === totalPagesCount}
          >
            Last
          </button>
        </div>
      </div>
    );
  };

  // Format number as currency
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-900 to-blue-700 text-white py-8 shadow-md">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center">
          <div className="md:w-1/2 mb-6 md:mb-0">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">Credit Velocity AI</h1>
            <p className="text-lg md:text-xl opacity-90">
              Compare mortgage payoff strategies and save thousands in interest
            </p>
          </div>
          <div className="md:w-1/2 flex justify-center">
            <img 
              src="https://images.unsplash.com/photo-1724482606633-fa74fe4f5de1" 
              alt="Mortgage calculator illustration" 
              className="h-48 rounded-lg shadow-lg object-cover"
            />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex flex-wrap -mb-px">
            <button
              className={`mr-2 py-2 px-4 font-medium border-b-2 ${
                activeTab === 'comparison'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent hover:border-gray-300 text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('comparison')}
            >
              Comparison Dashboard
            </button>
            <button
              className={`mr-2 py-2 px-4 font-medium border-b-2 ${
                activeTab === 'traditional'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent hover:border-gray-300 text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('traditional')}
            >
              Traditional EMI
            </button>
            <button
              className={`mr-2 py-2 px-4 font-medium border-b-2 ${
                activeTab === 'extra'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent hover:border-gray-300 text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('extra')}
            >
              Extra Payments
            </button>
            <button
              className={`mr-2 py-2 px-4 font-medium border-b-2 ${
                activeTab === 'loc'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent hover:border-gray-300 text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('loc')}
            >
              LOC Strategy
            </button>
          </nav>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column - Loan Setup Inputs */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Loan Setup</h2>
            
            <div className="mb-4">
              <label htmlFor="loanAmount" className="block text-sm font-medium text-gray-700 mb-1">
                Loan Amount ($)
              </label>
              <input
                type="number"
                id="loanAmount"
                value={loanAmount}
                onChange={(e) => setLoanAmount(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="interestRate" className="block text-sm font-medium text-gray-700 mb-1">
                Interest Rate (%)
              </label>
              <input
                type="number"
                id="interestRate"
                value={interestRate}
                onChange={(e) => setInterestRate(Number(e.target.value))}
                step="0.1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="loanTerm" className="block text-sm font-medium text-gray-700 mb-1">
                Loan Term (Years)
              </label>
              <input
                type="number"
                id="loanTerm"
                value={loanTerm}
                onChange={(e) => setLoanTerm(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div className="mt-6 pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Monthly Payment:</span>
                <span className="text-lg font-semibold text-blue-600">${monthlyPayment.toFixed(2)}</span>
              </div>
            </div>
          </div>
          
          {/* Middle Column - Budget Inputs */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Monthly Budget</h2>
            
            <div className="mb-4">
              <label htmlFor="monthlyIncome" className="block text-sm font-medium text-gray-700 mb-1">
                Monthly Income ($)
              </label>
              <input
                type="number"
                id="monthlyIncome"
                value={monthlyIncome}
                onChange={(e) => setMonthlyIncome(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="monthlyExpenses" className="block text-sm font-medium text-gray-700 mb-1">
                Monthly Expenses ($)
              </label>
              <input
                type="number"
                id="monthlyExpenses"
                value={monthlyExpenses}
                onChange={(e) => setMonthlyExpenses(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div className="mt-6 pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Available for Extra Payments:</span>
                <span className="text-lg font-semibold text-green-600">${extraPaymentAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>
          
          {/* Right Column - LOC Settings */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Line of Credit Settings</h2>
            
            <div className="mb-4">
              <label htmlFor="locLimit" className="block text-sm font-medium text-gray-700 mb-1">
                Line of Credit Limit ($)
              </label>
              <input
                type="number"
                id="locLimit"
                value={locLimit}
                onChange={(e) => setLocLimit(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="locInterestRate" className="block text-sm font-medium text-gray-700 mb-1">
                LOC Interest Rate (%)
              </label>
              <input
                type="number"
                id="locInterestRate"
                value={locInterestRate}
                onChange={(e) => setLocInterestRate(Number(e.target.value))}
                step="0.1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="locChunkSize" className="block text-sm font-medium text-gray-700 mb-1">
                LOC Chunk Size ($)
              </label>
              <input
                type="number"
                id="locChunkSize"
                value={locChunkSize}
                onChange={(e) => setLocChunkSize(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            {/* Added paycheck parking option */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center">
                <input
                  id="paycheckParking"
                  type="checkbox"
                  checked={paycheckParking}
                  onChange={(e) => setPaycheckParking(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="paycheckParking" className="ml-2 block text-sm text-gray-700">
                  Enable Paycheck Parking
                </label>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                When enabled, your entire paycheck is applied to the LOC, and expenses are withdrawn from the LOC.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="mt-8">
          {/* Comparison Dashboard Tab */}
          {activeTab === 'comparison' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold mb-4 text-gray-800">Strategy Comparison</h2>
                <div className="h-80">
                  <Bar 
                    data={comparisonChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        y: {
                          beginAtZero: true,
                          title: {
                            display: true,
                            text: 'Amount ($) / Years'
                          }
                        }
                      },
                      plugins: {
                        tooltip: {
                          callbacks: {
                            label: function(context) {
                              let label = context.dataset.label || '';
                              if (label) {
                                label += ': ';
                              }
                              if (context.parsed.y !== null) {
                                if (context.dataIndex === 0) {
                                  label += '$' + context.parsed.y.toFixed(2);
                                } else {
                                  label += context.parsed.y.toFixed(2) + ' years';
                                }
                              }
                              return label;
                            }
                          }
                        },
                        legend: {
                          position: 'top',
                        },
                        title: {
                          display: true,
                          text: 'Total Interest & Payoff Time Comparison'
                        },
                      }
                    }}
                  />
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold mb-4 text-gray-800">Loan Balance Over Time</h2>
                <div className="h-80">
                  <Line 
                    data={balanceChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        y: {
                          beginAtZero: true,
                          title: {
                            display: true,
                            text: 'Loan Balance ($)'
                          }
                        },
                        x: {
                          ticks: {
                            maxTicksLimit: 6,
                            callback: function(value, index, values) {
                              // Only show every 12th month (yearly)
                              if (index % 12 === 0) {
                                return `Year ${Math.floor(index / 12) + 1}`;
                              }
                              return '';
                            }
                          }
                        }
                      },
                      plugins: {
                        tooltip: {
                          callbacks: {
                            label: function(context) {
                              let label = context.dataset.label || '';
                              if (label) {
                                label += ': ';
                              }
                              if (context.parsed.y !== null) {
                                label += '$' + context.parsed.y.toFixed(2);
                              }
                              return label;
                            }
                          }
                        },
                        legend: {
                          position: 'top',
                        },
                        title: {
                          display: true,
                          text: 'Loan Balance Over Time'
                        },
                      }
                    }}
                  />
                </div>
              </div>

              {/* Summary Cards */}
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Traditional EMI */}
                <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-500">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Traditional EMI</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-sm text-gray-600">Total Interest</p>
                      <p className="text-xl font-bold text-blue-600">${traditionalResults.totalInterest.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Payoff Time</p>
                      <p className="text-xl font-bold text-blue-600">{(traditionalResults.payoffMonths / 12).toFixed(1)} years</p>
                    </div>
                  </div>
                </div>
                
                {/* Extra Payment */}
                <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-green-500">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Extra Payment</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-sm text-gray-600">Total Interest</p>
                      <p className="text-xl font-bold text-green-600">${extraPaymentResults.totalInterest.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Payoff Time</p>
                      <p className="text-xl font-bold text-green-600">{(extraPaymentResults.payoffMonths / 12).toFixed(1)} years</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-gray-600">Interest Savings</p>
                      <p className="text-lg font-bold text-green-600">
                        ${(traditionalResults.totalInterest - extraPaymentResults.totalInterest).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* LOC Strategy */}
                <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-red-500">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">LOC Strategy</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-sm text-gray-600">Total Interest</p>
                      <p className="text-xl font-bold text-red-600">${locResults.totalInterest.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Payoff Time</p>
                      <p className="text-xl font-bold text-red-600">{(locResults.payoffMonths / 12).toFixed(1)} years</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-gray-600">Interest Savings</p>
                      <p className="text-lg font-bold text-red-600">
                        ${(traditionalResults.totalInterest - locResults.totalInterest).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Traditional EMI Tab */}
          {activeTab === 'traditional' && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">Traditional EMI Payment</h2>
              <div className="mb-6">
                <p className="text-gray-700 mb-4">
                  This is the standard mortgage amortization schedule. Monthly payments remain fixed for the duration of the loan term.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Monthly Payment</p>
                    <p className="text-2xl font-bold text-blue-600">${monthlyPayment.toFixed(2)}</p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Total Interest</p>
                    <p className="text-2xl font-bold text-blue-600">${traditionalResults.totalInterest.toFixed(2)}</p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Payoff Time</p>
                    <p className="text-2xl font-bold text-blue-600">{(traditionalResults.payoffMonths / 12).toFixed(1)} years</p>
                  </div>
                </div>
              </div>
              <div className="h-80 mb-6">
                <Line 
                  data={{
                    labels: balanceChartData.labels,
                    datasets: [
                      balanceChartData.datasets[0]
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        beginAtZero: true,
                        title: {
                          display: true,
                          text: 'Loan Balance ($)'
                        }
                      },
                      x: {
                        ticks: {
                          maxTicksLimit: 6,
                          callback: function(value, index, values) {
                            if (index % 12 === 0) {
                              return `Year ${Math.floor(index / 12) + 1}`;
                            }
                            return '';
                          }
                        }
                      }
                    },
                    plugins: {
                      tooltip: {
                        callbacks: {
                          label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                              label += ': ';
                            }
                            if (context.parsed.y !== null) {
                              label += '$' + context.parsed.y.toFixed(2);
                            }
                            return label;
                          }
                        }
                      },
                      legend: {
                        position: 'top',
                      },
                      title: {
                        display: true,
                        text: 'Traditional EMI - Loan Balance Over Time'
                      },
                    }
                  }}
                />
              </div>
              
              {/* Amortization Schedule */}
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Amortization Schedule</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border-b">Month</th>
                      <th className="py-2 px-4 border-b">Date</th>
                      <th className="py-2 px-4 border-b">Payment</th>
                      <th className="py-2 px-4 border-b">Principal</th>
                      <th className="py-2 px-4 border-b">Interest</th>
                      <th className="py-2 px-4 border-b">Total Interest</th>
                      <th className="py-2 px-4 border-b">Remaining Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getPaginatedData(traditionalSchedule).map((row, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="py-2 px-4 border-b text-center">{row.month}</td>
                        <td className="py-2 px-4 border-b">{row.date}</td>
                        <td className="py-2 px-4 border-b">{formatCurrency(row.payment)}</td>
                        <td className="py-2 px-4 border-b">{formatCurrency(row.principal)}</td>
                        <td className="py-2 px-4 border-b">{formatCurrency(row.interest)}</td>
                        <td className="py-2 px-4 border-b">{formatCurrency(row.totalInterest)}</td>
                        <td className="py-2 px-4 border-b">{formatCurrency(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              <PaginationControls schedule={traditionalSchedule} />
            </div>
          )}

          {/* Extra Payment Tab */}
          {activeTab === 'extra' && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">Extra Payment Strategy</h2>
              <div className="mb-6">
                <p className="text-gray-700 mb-4">
                  This strategy involves making additional principal payments each month from your free cash flow, 
                  which reduces interest and shortens the loan term.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Base Payment</p>
                    <p className="text-2xl font-bold text-green-600">${monthlyPayment.toFixed(2)}</p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Extra Payment</p>
                    <p className="text-2xl font-bold text-green-600">${extraPaymentAmount.toFixed(2)}</p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Total Interest</p>
                    <p className="text-2xl font-bold text-green-600">${extraPaymentResults.totalInterest.toFixed(2)}</p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Payoff Time</p>
                    <p className="text-2xl font-bold text-green-600">{(extraPaymentResults.payoffMonths / 12).toFixed(1)} years</p>
                  </div>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg mb-6">
                  <p className="text-sm text-gray-600">Interest Savings vs. Traditional EMI</p>
                  <p className="text-2xl font-bold text-blue-600">
                    ${(traditionalResults.totalInterest - extraPaymentResults.totalInterest).toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="h-80 mb-6">
                <Line 
                  data={{
                    labels: balanceChartData.labels,
                    datasets: [
                      balanceChartData.datasets[0],
                      balanceChartData.datasets[1]
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        beginAtZero: true,
                        title: {
                          display: true,
                          text: 'Loan Balance ($)'
                        }
                      },
                      x: {
                        ticks: {
                          maxTicksLimit: 6,
                          callback: function(value, index, values) {
                            if (index % 12 === 0) {
                              return `Year ${Math.floor(index / 12) + 1}`;
                            }
                            return '';
                          }
                        }
                      }
                    },
                    plugins: {
                      tooltip: {
                        callbacks: {
                          label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                              label += ': ';
                            }
                            if (context.parsed.y !== null) {
                              label += '$' + context.parsed.y.toFixed(2);
                            }
                            return label;
                          }
                        }
                      },
                      legend: {
                        position: 'top',
                      },
                      title: {
                        display: true,
                        text: 'Extra Payment Strategy - Comparison'
                      },
                    }
                  }}
                />
              </div>
              
              {/* Amortization Schedule */}
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Amortization Schedule</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border-b">Month</th>
                      <th className="py-2 px-4 border-b">Date</th>
                      <th className="py-2 px-4 border-b">Base Payment</th>
                      <th className="py-2 px-4 border-b">Extra Payment</th>
                      <th className="py-2 px-4 border-b">Interest</th>
                      <th className="py-2 px-4 border-b">Principal</th>
                      <th className="py-2 px-4 border-b">Total Interest</th>
                      <th className="py-2 px-4 border-b">Remaining Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getPaginatedData(extraPaymentSchedule).map((row, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="py-2 px-4 border-b text-center">{row.month}</td>
                        <td className="py-2 px-4 border-b">{row.date}</td>
                        <td className="py-2 px-4 border-b">{formatCurrency(row.basePayment)}</td>
                        <td className="py-2 px-4 border-b">{formatCurrency(row.extraPayment)}</td>
                        <td className="py-2 px-4 border-b">{formatCurrency(row.interest)}</td>
                        <td className="py-2 px-4 border-b">{formatCurrency(row.principalFromBase + row.principalFromExtra)}</td>
                        <td className="py-2 px-4 border-b">{formatCurrency(row.totalInterest)}</td>
                        <td className="py-2 px-4 border-b">{formatCurrency(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              <PaginationControls schedule={extraPaymentSchedule} />
            </div>
          )}

          {/* LOC Strategy Tab */}
          {activeTab === 'loc' && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">Line of Credit (LOC) Strategy</h2>
              <div className="mb-6">
                <p className="text-gray-700 mb-4">
                  The LOC strategy (also known as Velocity Banking) involves using a line of credit to make 
                  large lump sum payments on your mortgage, then aggressively paying down the LOC with your monthly income.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-red-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Chunk Size</p>
                    <p className="text-2xl font-bold text-red-600">${locChunkSize.toFixed(2)}</p>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">LOC Interest Rate</p>
                    <p className="text-2xl font-bold text-red-600">{locInterestRate.toFixed(2)}%</p>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Total Interest</p>
                    <p className="text-2xl font-bold text-red-600">${locResults.totalInterest.toFixed(2)}</p>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Payoff Time</p>
                    <p className="text-2xl font-bold text-red-600">{(locResults.payoffMonths / 12).toFixed(1)} years</p>
                  </div>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg mb-6">
                  <p className="text-sm text-gray-600">Interest Savings vs. Traditional EMI</p>
                  <p className="text-2xl font-bold text-blue-600">
                    ${(traditionalResults.totalInterest - locResults.totalInterest).toFixed(2)}
                  </p>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">LOC Strategy Method</h3>
                  <div className="flex items-center mb-3">
                    <div className={`mr-4 flex items-center ${paycheckParking ? 'font-semibold text-blue-600' : ''}`}>
                      <input 
                        type="radio" 
                        id="paycheckParkingOn" 
                        name="locMethod" 
                        checked={paycheckParking} 
                        onChange={() => setPaycheckParking(true)}
                        className="mr-2"
                      />
                      <label htmlFor="paycheckParkingOn">Paycheck Parking</label>
                    </div>
                    <div className={`flex items-center ${!paycheckParking ? 'font-semibold text-blue-600' : ''}`}>
                      <input 
                        type="radio" 
                        id="paycheckParkingOff" 
                        name="locMethod" 
                        checked={!paycheckParking} 
                        onChange={() => setPaycheckParking(false)}
                        className="mr-2"
                      />
                      <label htmlFor="paycheckParkingOff">Free Cash Flow</label>
                    </div>
                  </div>
                  <div>
                    {paycheckParking ? (
                      <ol className="list-decimal list-inside space-y-2 text-gray-700">
                        <li>Take a chunk from your Line of Credit and apply it to your mortgage principal</li>
                        <li>Deposit your entire paycheck to your LOC each month (reduces LOC balance)</li>
                        <li>Draw your living expenses and mortgage payment from the LOC</li>
                        <li>Once the LOC is paid off, take another chunk and repeat the process</li>
                      </ol>
                    ) : (
                      <ol className="list-decimal list-inside space-y-2 text-gray-700">
                        <li>Take a chunk from your Line of Credit and apply it to your mortgage principal</li>
                        <li>Make your regular mortgage payment each month</li>
                        <li>Use your remaining cash flow to aggressively pay down the LOC</li>
                        <li>Once the LOC is paid off, take another chunk and repeat the process</li>
                      </ol>
                    )}
                  </div>
                </div>
              </div>
              <div className="h-80 mb-6">
                <Line 
                  data={{
                    labels: balanceChartData.labels,
                    datasets: [
                      balanceChartData.datasets[0],
                      balanceChartData.datasets[2]
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        beginAtZero: true,
                        title: {
                          display: true,
                          text: 'Loan Balance ($)'
                        }
                      },
                      x: {
                        ticks: {
                          maxTicksLimit: 6,
                          callback: function(value, index, values) {
                            if (index % 12 === 0) {
                              return `Year ${Math.floor(index / 12) + 1}`;
                            }
                            return '';
                          }
                        }
                      }
                    },
                    plugins: {
                      tooltip: {
                        callbacks: {
                          label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                              label += ': ';
                            }
                            if (context.parsed.y !== null) {
                              label += '$' + context.parsed.y.toFixed(2);
                            }
                            return label;
                          }
                        }
                      },
                      legend: {
                        position: 'top',
                      },
                      title: {
                        display: true,
                        text: 'LOC Strategy - Comparison'
                      },
                    }
                  }}
                />
              </div>
              
              {/* LOC Amortization Schedule */}
              <h3 className="text-lg font-semibold text-gray-800 mb-3">LOC Amortization Schedule</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr className="bg-gray-100 text-sm">
                      <th className="py-2 px-3 border-b">Pmt No.</th>
                      <th className="py-2 px-3 border-b">Date</th>
                      <th className="py-2 px-3 border-b">Payment</th>
                      <th className="py-2 px-3 border-b">Interest</th>
                      <th className="py-2 px-3 border-b">Principal Paid</th>
                      <th className="py-2 px-3 border-b">Balance (Using LOC)</th>
                      <th className="py-2 px-3 border-b">Rate</th>
                      <th className="py-2 px-3 border-b">LOC Payment</th>
                      <th className="py-2 px-3 border-b">Draw</th>
                      <th className="py-2 px-3 border-b">LOC Balance</th>
                      <th className="py-2 px-3 border-b">Total Owed</th>
                      <th className="py-2 px-3 border-b">Chunk Applied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getPaginatedData(locSchedule).map((row, index) => (
                      <tr key={index} className={row.chunkApplied ? 'bg-green-50' : (index % 2 === 0 ? 'bg-white' : 'bg-gray-50')}>
                        <td className="py-2 px-3 border-b text-center">{row.pmtNo}</td>
                        <td className="py-2 px-3 border-b">{row.date}</td>
                        <td className="py-2 px-3 border-b">{formatCurrency(row.payment)}</td>
                        <td className="py-2 px-3 border-b">{formatCurrency(row.interest)}</td>
                        <td className="py-2 px-3 border-b">{formatCurrency(row.principalPaid)}</td>
                        <td className="py-2 px-3 border-b">{formatCurrency(row.balance)}</td>
                        <td className="py-2 px-3 border-b">{row.rate}%</td>
                        <td className="py-2 px-3 border-b">{formatCurrency(row.locPayment)}</td>
                        <td className="py-2 px-3 border-b">{formatCurrency(row.draw)}</td>
                        <td className="py-2 px-3 border-b">{formatCurrency(row.locBalance)}</td>
                        <td className="py-2 px-3 border-b font-medium">{formatCurrency(row.totalOwed)}</td>
                        <td className="py-2 px-3 border-b text-center">{row.chunkApplied ? '✓' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              <PaginationControls schedule={locSchedule} />
              
              {/* Detailed LOC Amortization Schedule (Optional) */}
              <div className="mt-8">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-800">Detailed LOC Information</h3>
                  <button 
                    onClick={() => {
                      const detailsTable = document.getElementById('detailedLocTable');
                      if (detailsTable) {
                        detailsTable.classList.toggle('hidden');
                      }
                    }}
                    className="px-3 py-1 bg-gray-200 rounded text-gray-700 hover:bg-gray-300"
                  >
                    Show/Hide Details
                  </button>
                </div>
                <div id="detailedLocTable" className="overflow-x-auto hidden">
                  <table className="min-w-full bg-white border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100 text-xs">
                        <th className="py-2 px-2 border-b">Pmt No.</th>
                        <th className="py-2 px-2 border-b">Interest to Mrtg</th>
                        <th className="py-2 px-2 border-b">Interest Accrued</th>
                        <th className="py-2 px-2 border-b">Interest Paid</th>
                        <th className="py-2 px-2 border-b">LOC Prin. Balance</th>
                        <th className="py-2 px-2 border-b">LOC Paid</th>
                        <th className="py-2 px-2 border-b">Total Interest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getPaginatedData(locSchedule).map((row, index) => (
                        <tr key={index} className={row.chunkApplied ? 'bg-green-50' : (index % 2 === 0 ? 'bg-white' : 'bg-gray-50')}>
                          <td className="py-2 px-2 border-b text-center">{row.pmtNo}</td>
                          <td className="py-2 px-2 border-b">{formatCurrency(row.interestToMrtg)}</td>
                          <td className="py-2 px-2 border-b">{formatCurrency(row.interestAccrued)}</td>
                          <td className="py-2 px-2 border-b">{formatCurrency(row.interestPaid)}</td>
                          <td className="py-2 px-2 border-b">{formatCurrency(row.locPrinBalance)}</td>
                          <td className="py-2 px-2 border-b">{formatCurrency(row.locPaid)}</td>
                          <td className="py-2 px-2 border-b">{formatCurrency(row.totalInterest)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-6 mt-12">
        <div className="container mx-auto px-4 text-center">
          <p>Credit Velocity AI &copy; 2025. Compare mortgage strategies and save on interest.</p>
          <p className="text-gray-400 text-sm mt-2">
            Disclaimer: This calculator provides estimates for educational purposes only. 
            Please consult with a financial advisor before making financial decisions.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
