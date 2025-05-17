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

  // Results for each strategy
  const [traditionalResults, setTraditionalResults] = useState({ totalInterest: 0, totalPayments: 0, payoffMonths: 0 });
  const [extraPaymentResults, setExtraPaymentResults] = useState({ totalInterest: 0, totalPayments: 0, payoffMonths: 0 });
  const [locResults, setLocResults] = useState({ totalInterest: 0, totalPayments: 0, payoffMonths: 0 });
  
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

  // Calculate results for traditional EMI payment
  const calculateTraditionalPayment = () => {
    const monthlyRate = interestRate / 100 / 12;
    const numPayments = loanTerm * 12;
    const payment = calculateMonthlyPayment(loanAmount, interestRate, loanTerm);
    
    let remainingBalance = loanAmount;
    let totalInterest = 0;
    let balanceByMonth = [loanAmount];
    
    for (let i = 1; i <= numPayments && remainingBalance > 0; i++) {
      const interestForMonth = remainingBalance * monthlyRate;
      const principalForMonth = payment - interestForMonth;
      
      remainingBalance = Math.max(0, remainingBalance - principalForMonth);
      totalInterest += interestForMonth;
      
      balanceByMonth.push(remainingBalance);
    }
    
    return {
      totalInterest,
      totalPayments: totalInterest + loanAmount,
      payoffMonths: balanceByMonth.length - 1,
      balanceByMonth
    };
  };

  // Calculate results for extra payment strategy
  const calculateExtraPaymentStrategy = () => {
    const monthlyRate = interestRate / 100 / 12;
    const numPayments = loanTerm * 12;
    const basePayment = calculateMonthlyPayment(loanAmount, interestRate, loanTerm);
    const extraPayment = Math.max(0, monthlyIncome - monthlyExpenses - basePayment);
    
    let remainingBalance = loanAmount;
    let totalInterest = 0;
    let balanceByMonth = [loanAmount];
    
    for (let i = 1; i <= numPayments && remainingBalance > 0; i++) {
      const interestForMonth = remainingBalance * monthlyRate;
      const principalForMonth = basePayment - interestForMonth;
      const totalPaymentForMonth = basePayment + extraPayment;
      const totalPrincipalForMonth = totalPaymentForMonth - interestForMonth;
      
      remainingBalance = Math.max(0, remainingBalance - totalPrincipalForMonth);
      totalInterest += interestForMonth;
      
      balanceByMonth.push(remainingBalance);
    }
    
    return {
      totalInterest,
      totalPayments: totalInterest + loanAmount,
      payoffMonths: balanceByMonth.length - 1,
      balanceByMonth,
      extraPaymentAmount: extraPayment
    };
  };

  // Calculate results for LOC chunking strategy
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
    let month = 1;
    
    // Apply initial chunk payment if possible
    if (locChunkSize <= locLimit) {
      remainingBalance -= locChunkSize;
      locBalance = locChunkSize;
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
      cashFlowRemaining -= (mortgageInterestForMonth + principalForMonth);
      
      // Pay down LOC with remaining cash flow
      const locPayment = Math.min(locBalance + locInterestForMonth, cashFlowRemaining);
      locBalance = Math.max(0, locBalance + locInterestForMonth - locPayment);
      locInterest += locInterestForMonth;
      
      // Apply another chunk if LOC is paid off and there's room
      if (locBalance === 0 && remainingBalance > locChunkSize && locChunkSize <= locLimit) {
        remainingBalance -= locChunkSize;
        locBalance = locChunkSize;
      }
      
      balanceByMonth.push(remainingBalance);
      month++;
    }
    
    return {
      totalInterest: totalInterest + locInterest,
      totalPayments: totalInterest + locInterest + loanAmount,
      payoffMonths: month - 1,
      balanceByMonth
    };
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
  }, [loanAmount, interestRate, loanTerm, monthlyIncome, monthlyExpenses, locLimit, locInterestRate, locChunkSize]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-900 to-blue-700 text-white py-8 shadow-md">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center">
          <div className="md:w-1/2 mb-6 md:mb-0">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">Loan Velocity Optimizer</h1>
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
              <div className="h-80">
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
              <div className="h-80">
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-red-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Chunk Size</p>
                    <p className="text-2xl font-bold text-red-600">${locChunkSize.toFixed(2)}</p>
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
              </div>
              <div className="h-80">
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
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-6 mt-12">
        <div className="container mx-auto px-4 text-center">
          <p>Loan Velocity Optimizer &copy; 2025. Compare mortgage strategies and save on interest.</p>
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
